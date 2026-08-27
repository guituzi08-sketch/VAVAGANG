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
import { getRoom, joinRoom, leaveRoom, subscribeToParticipants, subscribeToRoom, updateParticipantState } from "../services/roomService";
import { useAuth } from "./AuthContext";

const CallContext = createContext(null);
const turnServer = import.meta.env.VITE_TURN_URL;
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    ...(turnServer ? [{
      urls: turnServer,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    }] : []),
  ],
  iceCandidatePoolSize: 10,
};

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
  const [cameraStream, setCameraStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [remoteCameraStreams, setRemoteCameraStreams] = useState({});
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
  const cameraStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const pendingCandidates = useRef(new Map());
  const processedCandidates = useRef(new Set());
  const processedSignals = useRef(new Set());
  const signalQueue = useRef(Promise.resolve());
  const reconnectTimers = useRef(new Map());
  const participantsRef = useRef([]);
  const sessionIdRef = useRef(null);
  const callTokenRef = useRef(0);
  const participantSharingRef = useRef(new Map());

  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { cameraStreamRef.current = cameraStream; }, [cameraStream]);
  useEffect(() => { screenStreamRef.current = screenStream; }, [screenStream]);
  useEffect(() => { participantsRef.current = participants; }, [participants]);

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

  function updateRemoteCameraStream(uid, stream) {
    setRemoteCameraStreams((current) => {
      if (stream) return { ...current, [uid]: stream };
      const next = { ...current };
      delete next[uid];
      return next;
    });
  }

  function removePeer(uid) {
    const reconnectTimer = reconnectTimers.current.get(uid);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimers.current.delete(uid);
    const peer = peers.current.get(uid);
    if (peer) peer.closedByApp = true;
    peer?.close();
    peers.current.delete(uid);
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[uid];
      return next;
    });
    updateRemoteCameraStream(uid, null);
    setRemoteScreenStreams((current) => {
      const next = { ...current };
      delete next[uid];
      return next;
    });
  }

  function enqueueSignal(work) {
    signalQueue.current = signalQueue.current.then(work, work);
    return signalQueue.current;
  }

  function schedulePeerRecovery(remoteUid) {
    if (reconnectTimers.current.has(remoteUid)) return;
    const timer = setTimeout(() => {
      reconnectTimers.current.delete(remoteUid);
      const participantStillPresent = participantsRef.current.some((participant) => participant.uid === remoteUid);
      const peer = peers.current.get(remoteUid);
      if (!participantStillPresent || !peer || peer.connectionState === "connected") return;
      removePeer(remoteUid);
      if (firebaseUser.uid < remoteUid) createPeer(remoteUid, true).catch((error) => setMediaError(`Falha ao recuperar áudio: ${error.message}`));
    }, 1500);
    reconnectTimers.current.set(remoteUid, timer);
  }

  async function flushPendingCandidates(remoteUid, peer) {
    const queuedCandidates = pendingCandidates.current.get(remoteUid) ?? [];
    const matchingCandidates = queuedCandidates.filter(({ sessionId }) => !sessionId || sessionId === peer.remoteSessionId);
    const remainingCandidates = queuedCandidates.filter(({ sessionId }) => sessionId && sessionId !== peer.remoteSessionId);
    await Promise.all(matchingCandidates.map(({ candidate }) => peer.addIceCandidate(candidate)));
    if (remainingCandidates.length) pendingCandidates.current.set(remoteUid, remainingCandidates);
    else pendingCandidates.current.delete(remoteUid);
  }

  function requestPeerNegotiation(remoteUid, peer) {
    const negotiation = (peer.negotiationChain ?? Promise.resolve()).then(async () => {
      if (peers.current.get(remoteUid) !== peer || peer.closedByApp || peer.signalingState !== "stable") return;
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (peers.current.get(remoteUid) !== peer || peer.closedByApp) return;
      await setDoc(doc(db, "rooms", roomIdRef.current, "signals", `${firebaseUser.uid}_${remoteUid}_offer_${peer.localSessionId}_${Date.now()}`), {
        from: firebaseUser.uid,
        to: remoteUid,
        type: "offer",
        sessionId: peer.localSessionId,
        sdp: offer.sdp,
      });
    });
    peer.negotiationChain = negotiation.catch((error) => {
      peer.negotiationChain = Promise.resolve();
      throw error;
    });
    return peer.negotiationChain;
  }

  async function createPeer(remoteUid, shouldOffer) {
    const existingPeer = peers.current.get(remoteUid);
    if (existingPeer) {
      await existingPeer.readyPromise;
      if (shouldOffer && !existingPeer.localDescription) await requestPeerNegotiation(remoteUid, existingPeer);
      return existingPeer;
    }
    const roomId = roomIdRef.current;
    const peer = new RTCPeerConnection(rtcConfig);
    peer.remoteUid = remoteUid;
    peer.localSessionId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    peers.current.set(remoteUid, peer);
    const remoteAudioStream = new MediaStream();
    const remoteCameraStream = new MediaStream();
    const remoteScreenStream = new MediaStream();
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    const audioTransceiver = peer.addTransceiver("audio", { direction: "sendrecv" });
    const screenAudioTransceiver = peer.addTransceiver("audio", { direction: "sendrecv" });
    const cameraVideoTransceiver = peer.addTransceiver("video", { direction: "sendrecv" });
    const videoTransceiver = peer.addTransceiver("video", { direction: "sendrecv" });
    const audioSender = audioTransceiver.sender;
    const cameraVideoSender = cameraVideoTransceiver.sender;
    const readyPromise = audioSender.replaceTrack(audioTrack ?? null);
    peer.readyPromise = readyPromise;
    peer.media = { audioSender, cameraVideoSender, screenAudioSender: screenAudioTransceiver.sender, screenVideoSender: videoTransceiver.sender, remoteAudioStream, remoteCameraStream, remoteScreenStream };
    console.info("[VOICE DEBUG] local stream", Boolean(localStreamRef.current));
    console.info("[VOICE DEBUG] audio tracks", localStreamRef.current?.getAudioTracks().length ?? 0);
    console.info("[VOICE DEBUG] audio track", { enabled: audioTrack?.enabled ?? false, readyState: audioTrack?.readyState ?? "missing" });
    console.info("[VOICE DEBUG] audio sender exists", Boolean(audioSender));
    if (screenStreamRef.current) {
      peer.readyPromise = Promise.all([
        readyPromise,
        cameraVideoSender.replaceTrack(cameraStreamRef.current?.getVideoTracks()[0] ?? null),
        videoTransceiver.sender.replaceTrack(screenStreamRef.current.getVideoTracks()[0] ?? null),
        screenAudioTransceiver.sender.replaceTrack(screenStreamRef.current.getAudioTracks()[0] ?? null),
      ]);
    } else if (cameraStreamRef.current) {
      peer.readyPromise = Promise.all([readyPromise, cameraVideoSender.replaceTrack(cameraStreamRef.current.getVideoTracks()[0] ?? null)]);
    }
    peer.ontrack = (event) => {
      if (peers.current.get(remoteUid) !== peer || peer.closedByApp) return;
      const isScreenTrack = event.transceiver === screenAudioTransceiver || event.transceiver === videoTransceiver;
      const isCameraTrack = event.transceiver === cameraVideoTransceiver;
      const stream = isScreenTrack ? remoteScreenStream : isCameraTrack ? remoteCameraStream : remoteAudioStream;
      console.info("[VOICE DEBUG] REMOTE TRACK RECEIVED", { remoteUid, kind: event.track.kind, streamCount: event.streams.length });
      if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
      if (isScreenTrack) console.info("[WebRTC][ScreenShare] track received", remoteUid, event.track.kind);
      if (isScreenTrack) {
        if (event.track.kind === "video" && participantSharingRef.current.get(remoteUid) !== true) {
          console.info("[WebRTC][ScreenShare] ignoring inactive video track", remoteUid);
        } else {
          updateRemoteScreenStream(remoteUid, stream);
        }
      } else if (isCameraTrack) updateRemoteCameraStream(remoteUid, stream);
      else updateRemoteStream(remoteUid, stream);
      event.track.onended = () => {
        stream.removeTrack(event.track);
        if (isScreenTrack && !stream.getVideoTracks().length) updateRemoteScreenStream(remoteUid, null);
        if (isCameraTrack && !stream.getVideoTracks().length) updateRemoteCameraStream(remoteUid, null);
        console.info("[WebRTC][ScreenShare] track ended", remoteUid);
      };
      debugVoiceConnection(peer, remoteUid).catch((error) => console.error("[VOICE DEBUG] stats failed", error));
    };
    peer.onicecandidate = async (event) => {
      if (!event.candidate) return;
      try {
        if (peers.current.get(remoteUid) !== peer || peer.closedByApp) return;
        await addDoc(collection(db, "rooms", roomId, "candidates"), {
          from: firebaseUser.uid,
          to: remoteUid,
          sessionId: peer.localSessionId,
          candidate: event.candidate.toJSON(),
        });
      } catch (error) {
        setMediaError(`Falha ao enviar ICE candidate: ${error.message}`);
      }
    };
    peer.onconnectionstatechange = () => {
      console.info("[VOICE DEBUG] connection state", remoteUid, peer.connectionState, peer.iceConnectionState, peer.iceGatheringState, peer.signalingState);
      if (["failed", "disconnected"].includes(peer.connectionState) || ["failed", "disconnected"].includes(peer.iceConnectionState)) schedulePeerRecovery(remoteUid);
      if (peer.connectionState === "connected") {
        const reconnectTimer = reconnectTimers.current.get(remoteUid);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimers.current.delete(remoteUid);
      }
    };
    peer.oniceconnectionstatechange = () => {
      console.info("[VOICE DEBUG] ICE state", remoteUid, peer.iceConnectionState);
      if (["failed", "disconnected"].includes(peer.iceConnectionState)) schedulePeerRecovery(remoteUid);
    };

    await peer.readyPromise;
    if (shouldOffer) await requestPeerNegotiation(remoteUid, peer);
    return peer;
  }

  useEffect(() => {
    if (!firebaseUser || !roomIdRef.current || !localStream) return undefined;
    let cancelled = false;
    const roomId = roomIdRef.current;
    const signalsQuery = query(collection(db, "rooms", roomId, "signals"), where("to", "==", firebaseUser.uid));
    const candidatesQuery = query(collection(db, "rooms", roomId, "candidates"), where("to", "==", firebaseUser.uid));
    const unsubscribeSignals = onSnapshot(signalsQuery, (snapshot) => enqueueSignal(async () => {
      try {
        for (const change of snapshot.docChanges()) {
          if (!['added', 'modified'].includes(change.type) || cancelled) continue;
          const signal = change.doc.data();
          if (signal.from === firebaseUser.uid || !signal.sdp || !signal.sessionId) continue;
          const signalKey = `${change.doc.id}:${signal.type}:${signal.sdp}`;
          if (processedSignals.current.has(signalKey)) continue;
          let peer = await createPeer(signal.from, false);
          if (signal.type === "offer") {
            if (peer.remoteSessionId && peer.remoteSessionId !== signal.sessionId) {
              removePeer(signal.from);
              peer = await createPeer(signal.from, false);
            }
            if (peer.signalingState === "have-local-offer" && firebaseUser.uid > signal.from) {
              await peer.setLocalDescription({ type: "rollback" });
            } else if (peer.signalingState !== "stable") {
              continue;
            }
            await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
            peer.remoteSessionId = signal.sessionId ?? null;
            peer.remoteOfferSdp = signal.sdp;
            processedSignals.current.add(signalKey);
            console.info("[VOICE DEBUG] received offer audio", signal.sdp.includes("m=audio"));
            await flushPendingCandidates(signal.from, peer);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            console.info("[VOICE DEBUG] answer audio", peer.localDescription?.sdp?.includes("m=audio"));
            await setDoc(doc(db, "rooms", roomId, "signals", `${firebaseUser.uid}_${signal.from}_answer_${peer.localSessionId}`), {
              from: firebaseUser.uid,
              to: signal.from,
              type: "answer",
              sessionId: peer.localSessionId,
              offerSessionId: signal.sessionId ?? null,
              sdp: answer.sdp,
            });
          } else if (signal.type === "answer") {
            if (peer.signalingState !== "have-local-offer") continue;
            if (signal.offerSessionId && signal.offerSessionId !== peer.localSessionId) continue;
            await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
            peer.remoteSessionId = signal.sessionId ?? null;
            processedSignals.current.add(signalKey);
            console.info("[VOICE DEBUG] received answer audio", signal.sdp.includes("m=audio"));
            await flushPendingCandidates(signal.from, peer);
          }
        }
      } catch (error) {
        setMediaError(`Falha na negociação WebRTC: ${error.message}`);
      }
    }));
    const unsubscribeCandidates = onSnapshot(candidatesQuery, (snapshot) => enqueueSignal(async () => {
      try {
        for (const change of snapshot.docChanges()) {
          if (change.type !== "added") continue;
          const candidate = change.doc.data();
          if (!candidate.sessionId) continue;
          if (processedCandidates.current.has(change.doc.id)) continue;
          const peer = await createPeer(candidate.from, false);
          if (candidate.sessionId && peer.remoteSessionId && candidate.sessionId !== peer.remoteSessionId) {
            processedCandidates.current.add(change.doc.id);
            continue;
          }
          if (peer.currentRemoteDescription) {
            await peer.addIceCandidate(candidate.candidate);
            processedCandidates.current.add(change.doc.id);
          } else {
            const queued = pendingCandidates.current.get(candidate.from) ?? [];
            pendingCandidates.current.set(candidate.from, [...queued, { sessionId: candidate.sessionId, candidate: candidate.candidate }]);
            processedCandidates.current.add(change.doc.id);
          }
        }
      } catch (error) {
        setMediaError(`Falha ao receber ICE candidate: ${error.message}`);
      }
    }));

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
    let stream;
    try {
      const room = await getRoom(roomId);
      if (!room) {
        const roomError = new Error("Esta sala não existe mais.");
        roomError.code = "room-not-found";
        throw roomError;
      }
      if (callToken !== callTokenRef.current) return;
      roomIdRef.current = room.id;
      setActiveRoomId(room.id);
      setRoomClosed(false);
      setRoomClosedMessage("");
      setMediaError("");
      setIsConnecting(true);
      sessionIdRef.current = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Seu navegador não oferece acesso ao microfone.");
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      await joinRoom(room.id, firebaseUser, profile);
      if (callToken !== callTokenRef.current) {
        await leaveRoom(room.id, firebaseUser.uid);
        stream.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        setLocalStream(null);
        setIsConnecting(false);
      }
      setIsConnecting(false);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (callToken !== callTokenRef.current) return;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
      localStreamRef.current = null;
      roomIdRef.current = null;
      setActiveRoomId(null);
      setIsConnecting(false);
      if (error.code === "room-not-found") {
        setRoomClosed(true);
        setRoomClosedMessage(error.message);
      }
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
      peers.current.forEach((peer) => {
        peer.closedByApp = true;
        peer.close();
      });
      peers.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      pendingCandidates.current.clear();
      processedCandidates.current.clear();
      processedSignals.current.clear();
      reconnectTimers.current.forEach((timer) => clearTimeout(timer));
      reconnectTimers.current.clear();
      sessionIdRef.current = null;
      participantSharingRef.current.clear();
      setLocalStream(null);
      setCameraStream(null);
      setScreenStream(null);
      setRemoteStreams({});
      setRemoteCameraStreams({});
      setRemoteScreenStreams({});
      localStreamRef.current = null;
      screenStreamRef.current = null;
      roomIdRef.current = null;
      setActiveRoomId(null);
      setIsConnecting(false);
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
  }

  useEffect(() => () => { exitCall(); }, []);

  useEffect(() => {
    if (!localStream || !firebaseUser) return undefined;
    participantSharingRef.current = new Map(participants.map((participant) => [participant.uid, participant.screenSharing === true]));
    const remotes = participants.filter((participant) => participant.uid !== firebaseUser.uid);
    remotes.forEach((participant) => {
      const peer = peers.current.get(participant.uid);
      if (peer?.media?.remoteScreenStream && participant.screenSharing !== true) {
        updateRemoteScreenStream(participant.uid, null);
      } else if (peer?.media?.remoteScreenStream && peer.media.remoteScreenStream.getVideoTracks().length > 0) {
        updateRemoteScreenStream(participant.uid, peer.media.remoteScreenStream);
      }
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
    if (cameraStreamRef.current) {
      stopCamera();
      return false;
    }
    startCamera();
    return true;
  }

  async function startCamera() {
    if (cameraStreamRef.current || !navigator.mediaDevices?.getUserMedia) return false;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("A câmera não forneceu uma faixa de vídeo.");
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      await Promise.all([...peers.current.values()].map((peer) => peer.media?.cameraVideoSender.replaceTrack(track)));
      await Promise.all([...peers.current.entries()].map(([uid, peer]) => requestPeerNegotiation(uid, peer)));
      track.onended = stopCamera;
      if (firebaseUser && roomIdRef.current) updateParticipantState(roomIdRef.current, firebaseUser.uid, { cameraEnabled: true }).catch((error) => setMediaError(error.message));
      return true;
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (cameraStreamRef.current === stream) {
        cameraStreamRef.current = null;
        setCameraStream(null);
      }
      setMediaError(error.name === "NotAllowedError" ? "Permita o acesso à câmera para ativar sua webcam." : error.message);
      return false;
    }
  }

  function stopCamera() {
    peers.current.forEach((peer) => {
      peer.media?.cameraVideoSender.replaceTrack(null)
        .then(() => requestPeerNegotiation(peer.remoteUid, peer))
        .catch((error) => console.error("[WebRTC][Camera] stop video error", error));
    });
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
    if (firebaseUser && roomIdRef.current) updateParticipantState(roomIdRef.current, firebaseUser.uid, { cameraEnabled: false }).catch((error) => setMediaError(error.message));
  }

  async function shareScreen() {
    if (screenStreamRef.current) {
      stopScreenShare();
      return;
    }
    let stream;
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        setMediaError("Seu navegador não suporta compartilhamento de tela.");
        return;
      }
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const screenTrack = stream.getVideoTracks()[0];
      const screenAudioTrack = stream.getAudioTracks()[0] ?? null;
      if (!screenTrack) throw new Error("Nenhuma tela foi disponibilizada.");
      screenStreamRef.current = stream;
      setScreenStream(stream);
      if (!screenAudioTrack) setMediaError("Seu navegador não disponibilizou o áudio desta tela.");
      console.info("[WebRTC][ScreenShare] starting", { hasAudio: Boolean(screenAudioTrack) });
      await Promise.all([...peers.current.values()].map(async (peer) => {
        await peer.media?.screenVideoSender.replaceTrack(screenTrack);
        await peer.media?.screenAudioSender.replaceTrack(screenAudioTrack);
        console.info("[WebRTC][ScreenShare] tracks replaced");
      }));
      await Promise.all([...peers.current.entries()].map(([uid, peer]) => requestPeerNegotiation(uid, peer)));
      if (firebaseUser && roomIdRef.current) updateParticipantState(roomIdRef.current, firebaseUser.uid, { screenSharing: true, screenAudio: Boolean(screenAudioTrack) }).catch((error) => setMediaError(error.message));
      screenTrack.onended = () => stopScreenShare();
    } catch (error) {
      if (screenStreamRef.current === stream) {
        screenStreamRef.current = null;
        setScreenStream(null);
      }
      stream?.getTracks().forEach((track) => track.stop());
      if (error.name === "AbortError" || error.name === "NotAllowedError") setMediaError("Compartilhamento cancelado.");
      else setMediaError(error.name === "NotReadableError" || error.name === "SecurityError" ? "Não foi possível capturar esta tela." : error.message);
      console.error("[WebRTC][ScreenShare] error", error);
    }
  }

  function stopScreenShare() {
    console.info("[WebRTC][ScreenShare] stopping");
    peers.current.forEach((peer) => {
      Promise.all([
        peer.media?.screenVideoSender.replaceTrack(null),
        peer.media?.screenAudioSender.replaceTrack(null),
      ]).then(() => requestPeerNegotiation(peer.remoteUid, peer))
        .catch((error) => console.error("[WebRTC][ScreenShare] stop track error", error));
    });
    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    if (firebaseUser && roomIdRef.current) updateParticipantState(roomIdRef.current, firebaseUser.uid, { screenSharing: false, screenAudio: false }).catch((error) => setMediaError(error.message));
  }

  return (
    <CallContext.Provider value={{ localStream, cameraStream, screenStream, remoteStreams, remoteCameraStreams, remoteScreenStreams, participants, mediaError, roomClosed, roomClosedMessage, activeRoomId, isConnecting, enterCall, exitCall, toggleAudio, toggleVideo, startCamera, stopCamera, shareScreen, stopScreenShare }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  return useContext(CallContext);
}