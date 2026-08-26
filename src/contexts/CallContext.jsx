import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { db } from "../firebase";
import { joinRoom, leaveRoom, subscribeToParticipants, subscribeToRoom, updateParticipantState } from "../services/roomService";
import { useAuth } from "./AuthContext";

const CallContext = createContext(null);
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

async function debugVoiceConnection(peer, remoteUid) {
  const senders = peer.getSenders();
  const receivers = peer.getReceivers();
  const transceivers = peer.getTransceivers();
  const stats = await peer.getStats();
  const outboundAudio = [...stats.values()].filter((report) => report.type === "outbound-rtp" && report.kind === "audio").map((report) => report.bytesSent ?? 0);
  const inboundAudio = [...stats.values()].filter((report) => report.type === "inbound-rtp" && report.kind === "audio").map((report) => report.bytesReceived ?? 0);
  console.info("[VOICE DEBUG] connection", {
    remoteUid,
    senders: senders.map((sender) => ({ kind: sender.track?.kind ?? null, readyState: sender.track?.readyState ?? null })),
    receivers: receivers.map((receiver) => ({ kind: receiver.track?.kind ?? null, readyState: receiver.track?.readyState ?? null })),
    transceivers: transceivers.map((transceiver) => ({ kind: transceiver.receiver.track?.kind ?? transceiver.sender.track?.kind ?? null, direction: transceiver.direction, currentDirection: transceiver.currentDirection })),
    connectionState: peer.connectionState,
    iceConnectionState: peer.iceConnectionState,
    iceGatheringState: peer.iceGatheringState,
    signalingState: peer.signalingState,
    outboundAudioBytes: outboundAudio.reduce((total, bytes) => total + bytes, 0),
    inboundAudioBytes: inboundAudio.reduce((total, bytes) => total + bytes, 0),
  });
}

export function CallProvider({ children }) {
  const { firebaseUser, profile } = useAuth();
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [remoteScreenStreams, setRemoteScreenStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  const [mediaError, setMediaError] = useState("");
  const [roomClosed, setRoomClosed] = useState(false);
  const [roomClosedMessage, setRoomClosedMessage] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const peers = useRef(new Map());
  const roomIdRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const pendingCandidates = useRef(new Map());
  const processedSignals = useRef(new Set());
  const callTokenRef = useRef(0);

  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { screenStreamRef.current = screenStream; }, [screenStream]);

  function updateRemoteStream(uid, stream) {
    setRemoteStreams((current) => ({ ...current, [uid]: stream }));
  }

  function updateRemoteScreenStream(uid, stream) {
    setRemoteScreenStreams((current) => {
      if (stream) return { ...current, [uid]: stream };
      const next = { ...current };
      delete next[uid];
      return next;
    });
  }

  function removePeer(uid) {
    peers.current.get(uid)?.close();
    peers.current.delete(uid);
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[uid];
      return next;
    });
    setRemoteScreenStreams((current) => {
      const next = { ...current };
      delete next[uid];
      return next;
    });
  }

  async function createPeer(remoteUid, shouldOffer) {
    if (peers.current.has(remoteUid)) return peers.current.get(remoteUid);
    const roomId = roomIdRef.current;
    const peer = new RTCPeerConnection(rtcConfig);
    peers.current.set(remoteUid, peer);
    const screenAudioTransceiver = peer.addTransceiver("audio", { direction: "sendrecv" });
    const videoTransceiver = peer.addTransceiver("video", { direction: "sendrecv" });
    const remoteAudioStream = new MediaStream();
    const remoteScreenStream = new MediaStream();
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    const audioSender = audioTrack && localStreamRef.current ? peer.addTrack(audioTrack, localStreamRef.current) : null;
    peer.media = { audioSender, screenAudioSender: screenAudioTransceiver.sender, videoSender: videoTransceiver.sender, remoteAudioStream, remoteScreenStream };
    console.info("[VOICE DEBUG] local stream", Boolean(localStreamRef.current));
    console.info("[VOICE DEBUG] audio tracks", localStreamRef.current?.getAudioTracks().length ?? 0);
    console.info("[VOICE DEBUG] audio track", { enabled: audioTrack?.enabled ?? false, readyState: audioTrack?.readyState ?? "missing" });
    console.info("[VOICE DEBUG] audio sender exists", Boolean(audioSender));
    const localAudioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (!audioSender && localAudioTrack) throw new Error("Não foi possível adicionar o microfone à PeerConnection.");
    if (screenStreamRef.current) {
      await videoTransceiver.sender.replaceTrack(screenStreamRef.current.getVideoTracks()[0] ?? null);
      await screenAudioTransceiver.sender.replaceTrack(screenStreamRef.current.getAudioTracks()[0] ?? null);
    }
    peer.ontrack = (event) => {
      const isScreenTrack = event.track.kind === "video" || event.transceiver === screenAudioTransceiver;
      const stream = isScreenTrack ? remoteScreenStream : remoteAudioStream;
      console.info("[VOICE DEBUG] REMOTE TRACK RECEIVED", { remoteUid, kind: event.track.kind, streamCount: event.streams.length });
      if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
      if (isScreenTrack) console.info("[WebRTC][ScreenShare] track received", remoteUid, event.track.kind);
      if (isScreenTrack) updateRemoteScreenStream(remoteUid, stream);
      else updateRemoteStream(remoteUid, stream);
      event.track.onended = () => {
        stream.removeTrack(event.track);
        if (isScreenTrack && !stream.getVideoTracks().length) updateRemoteScreenStream(remoteUid, null);
        console.info("[WebRTC][ScreenShare] track ended", remoteUid);
      };
      debugVoiceConnection(peer, remoteUid).catch((error) => console.error("[VOICE DEBUG] stats failed", error));
    };
    peer.onicecandidate = async (event) => {
      if (!event.candidate) return;
      try {
        await addDoc(collection(db, "rooms", roomId, "candidates"), {
          from: firebaseUser.uid,
          to: remoteUid,
          candidate: event.candidate.toJSON(),
        });
      } catch (error) {
        setMediaError(`Falha ao enviar ICE candidate: ${error.message}`);
      }
    };
    peer.onconnectionstatechange = () => {
      console.info("[VOICE DEBUG] connection state", remoteUid, peer.connectionState, peer.iceConnectionState, peer.iceGatheringState, peer.signalingState);
    };

    if (shouldOffer) {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      console.info("[VOICE DEBUG] offer audio", peer.localDescription?.sdp?.includes("m=audio"));
      await setDoc(doc(db, "rooms", roomId, "signals", `${firebaseUser.uid}_${remoteUid}_offer`), {
        from: firebaseUser.uid,
        to: remoteUid,
        type: "offer",
        sdp: offer.sdp,
      });
    }
    return peer;
  }

  useEffect(() => {
    if (!firebaseUser || !roomIdRef.current || !localStream) return undefined;
    let cancelled = false;
    const roomId = roomIdRef.current;
    const signalsQuery = query(collection(db, "rooms", roomId, "signals"), where("to", "==", firebaseUser.uid));
    const candidatesQuery = query(collection(db, "rooms", roomId, "candidates"), where("to", "==", firebaseUser.uid));
    const unsubscribeSignals = onSnapshot(signalsQuery, async (snapshot) => {
      try {
        for (const change of snapshot.docChanges()) {
          if (!['added', 'modified'].includes(change.type) || cancelled) continue;
          const signal = change.doc.data();
          if (signal.from === firebaseUser.uid || !signal.sdp) continue;
          const signalKey = `${signal.from}:${signal.type}:${signal.sdp}`;
          if (processedSignals.current.has(signalKey)) continue;
          const peer = await createPeer(signal.from, false);
          if (signal.type === "offer") {
            if (peer.signalingState !== "stable") continue;
            await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
            processedSignals.current.add(signalKey);
            console.info("[VOICE DEBUG] received offer audio", signal.sdp.includes("m=audio"));
            const queuedCandidates = pendingCandidates.current.get(signal.from) ?? [];
            await Promise.all(queuedCandidates.map((candidate) => peer.addIceCandidate(candidate)));
            pendingCandidates.current.delete(signal.from);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            console.info("[VOICE DEBUG] answer audio", peer.localDescription?.sdp?.includes("m=audio"));
            await setDoc(doc(db, "rooms", roomId, "signals", `${firebaseUser.uid}_${signal.from}_answer`), {
              from: firebaseUser.uid,
              to: signal.from,
              type: "answer",
              sdp: answer.sdp,
            });
          } else if (signal.type === "answer" && !peer.currentRemoteDescription) {
            if (peer.signalingState !== "have-local-offer") continue;
            await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
            processedSignals.current.add(signalKey);
            console.info("[VOICE DEBUG] received answer audio", signal.sdp.includes("m=audio"));
            const queuedCandidates = pendingCandidates.current.get(signal.from) ?? [];
            await Promise.all(queuedCandidates.map((candidate) => peer.addIceCandidate(candidate)));
            pendingCandidates.current.delete(signal.from);
          }
        }
      } catch (error) {
        setMediaError(`Falha na negociação WebRTC: ${error.message}`);
      }
    });
    const unsubscribeCandidates = onSnapshot(candidatesQuery, async (snapshot) => {
      try {
        for (const change of snapshot.docChanges()) {
          if (change.type !== "added") continue;
          const candidate = change.doc.data();
          const peer = await createPeer(candidate.from, false);
          if (peer.remoteDescription) {
            await peer.addIceCandidate(candidate.candidate);
          } else {
            const queued = pendingCandidates.current.get(candidate.from) ?? [];
            pendingCandidates.current.set(candidate.from, [...queued, candidate.candidate]);
          }
        }
      } catch (error) {
        setMediaError(`Falha ao receber ICE candidate: ${error.message}`);
      }
    });

    return () => {
      cancelled = true;
      unsubscribeSignals();
      unsubscribeCandidates();
    };
  }, [firebaseUser, localStream]);

  useEffect(() => {
    if (!firebaseUser || !roomIdRef.current || !localStream) return undefined;
    return subscribeToParticipants(roomIdRef.current, setParticipants, setMediaError);
  }, [firebaseUser, localStream]);

  useEffect(() => {
    if (!firebaseUser || !activeRoomId) return undefined;
    return subscribeToRoom(activeRoomId, (room) => {
      if (!room || room.status === "closed") {
        setRoomClosed(true);
        setRoomClosedMessage(room ? "Esta sala foi encerrada pelo proprietário." : "Esta sala não existe mais.");
        exitCall();
      }
    }, (error) => setMediaError(error.message));
  }, [activeRoomId, firebaseUser]);

  async function enterCall(roomId) {
    if (!roomId || (roomIdRef.current === roomId && localStreamRef.current)) return;
    if (roomIdRef.current && roomIdRef.current !== roomId) await exitCall();
    const callToken = ++callTokenRef.current;
    roomIdRef.current = roomId;
    setActiveRoomId(roomId);
    setRoomClosed(false);
    setRoomClosedMessage("");
    setMediaError("");
    setIsConnecting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Seu navegador não oferece acesso ao microfone.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioTracks = stream.getAudioTracks();
      console.info("[VOICE DEBUG] local stream", stream.id ? "available" : "missing");
      console.info("[VOICE DEBUG] audio tracks", audioTracks.length);
      console.info("[VOICE DEBUG] audio track enabled", audioTracks[0]?.enabled ?? false);
      console.info("[VOICE DEBUG] audio track readyState", audioTracks[0]?.readyState ?? "missing");
      if (!audioTracks.length) throw new Error("O microfone não forneceu uma faixa de áudio.");
      if (callToken !== callTokenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      await joinRoom(roomId, firebaseUser, profile);
      if (callToken !== callTokenRef.current) {
        await leaveRoom(roomId, firebaseUser.uid);
        stream.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        setLocalStream(null);
        setIsConnecting(false);
      }
      setIsConnecting(false);
    } catch (error) {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
      localStreamRef.current = null;
      roomIdRef.current = null;
      setActiveRoomId(null);
      setIsConnecting(false);
      setMediaError(
        error.name === "NotAllowedError"
          ? "Permita microfone e câmera para entrar na sala."
          : error.name === "NotFoundError"
            ? "Nenhuma câmera ou microfone disponível neste dispositivo."
            : error.name === "NotReadableError" || error.name === "SecurityError"
              ? "Não foi possível acessar o microfone neste dispositivo."
            : error.message,
      );
    }
  }

  async function exitCall() {
    ++callTokenRef.current;
    const roomId = roomIdRef.current;
    try {
      if (roomId && firebaseUser) await leaveRoom(roomId, firebaseUser.uid);
    } finally {
      peers.current.forEach((peer) => peer.close());
      peers.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      pendingCandidates.current.clear();
      processedSignals.current.clear();
      setLocalStream(null);
      setScreenStream(null);
      setRemoteStreams({});
      setRemoteScreenStreams({});
      localStreamRef.current = null;
      screenStreamRef.current = null;
      roomIdRef.current = null;
      setActiveRoomId(null);
      setIsConnecting(false);
    }
  }

  useEffect(() => () => { exitCall(); }, []);

  useEffect(() => {
    if (!localStream || !firebaseUser) return undefined;
    const remotes = participants.filter((participant) => participant.uid !== firebaseUser.uid);
    remotes.forEach((participant) => {
      if (firebaseUser.uid < participant.uid) createPeer(participant.uid, true).catch((error) => setMediaError(`Falha ao conectar participante: ${error.message}`));
    });
    peers.current.forEach((_, uid) => {
      if (!remotes.some((participant) => participant.uid === uid)) removePeer(uid);
    });
    return undefined;
  }, [participants, localStream, firebaseUser]);

  function toggleAudio() {
    const track = localStream?.getAudioTracks()[0];
    if (track) track.enabled = !track.enabled;
    if (roomIdRef.current && firebaseUser) updateParticipantState(roomIdRef.current, firebaseUser.uid, { muted: !track?.enabled }).catch((error) => setMediaError(error.message));
    return track?.enabled ?? false;
  }

  function toggleVideo() {
    const track = localStream?.getVideoTracks()[0];
    if (track) track.enabled = !track.enabled;
    return track?.enabled ?? false;
  }

  async function shareScreen() {
    if (screenStream) {
      stopScreenShare();
      return;
    }
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        setMediaError("Seu navegador não suporta compartilhamento de tela.");
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const screenTrack = stream.getVideoTracks()[0];
      const screenAudioTrack = stream.getAudioTracks()[0] ?? null;
      if (!screenTrack) throw new Error("Nenhuma tela foi disponibilizada.");
      if (!screenAudioTrack) setMediaError("Seu navegador não disponibilizou o áudio desta tela.");
      console.info("[WebRTC][ScreenShare] starting", { hasAudio: Boolean(screenAudioTrack) });
      await Promise.all([...peers.current.values()].map(async (peer) => {
        await peer.media?.videoSender.replaceTrack(screenTrack);
        await peer.media?.screenAudioSender.replaceTrack(screenAudioTrack);
        console.info("[WebRTC][ScreenShare] tracks replaced");
      }));
      setScreenStream(stream);
      if (firebaseUser && roomIdRef.current) updateParticipantState(roomIdRef.current, firebaseUser.uid, { screenSharing: true, screenAudio: Boolean(screenAudioTrack) }).catch((error) => setMediaError(error.message));
      screenTrack.onended = () => stopScreenShare();
    } catch (error) {
      if (error.name === "AbortError" || error.name === "NotAllowedError") setMediaError("Compartilhamento cancelado.");
      else setMediaError(error.name === "NotReadableError" || error.name === "SecurityError" ? "Não foi possível capturar esta tela." : error.message);
      console.error("[WebRTC][ScreenShare] error", error);
    }
  }

  function stopScreenShare() {
    console.info("[WebRTC][ScreenShare] stopping");
    peers.current.forEach((peer) => {
      peer.media?.videoSender.replaceTrack(null).catch((error) => console.error("[WebRTC][ScreenShare] stop video error", error));
      peer.media?.screenAudioSender.replaceTrack(null).catch((error) => console.error("[WebRTC][ScreenShare] stop audio error", error));
    });
    screenStream?.getTracks().forEach((track) => track.stop());
    setScreenStream(null);
    if (firebaseUser && roomIdRef.current) updateParticipantState(roomIdRef.current, firebaseUser.uid, { screenSharing: false, screenAudio: false }).catch((error) => setMediaError(error.message));
  }

  return (
    <CallContext.Provider value={{ localStream, screenStream, remoteStreams, remoteScreenStreams, participants, mediaError, roomClosed, roomClosedMessage, activeRoomId, isConnecting, enterCall, exitCall, toggleAudio, toggleVideo, shareScreen, stopScreenShare }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  return useContext(CallContext);
}