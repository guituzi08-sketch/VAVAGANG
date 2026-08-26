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
import { joinRoom, leaveRoom, subscribeToParticipants } from "../services/roomService";
import { useAuth } from "./AuthContext";

const CallContext = createContext(null);
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

export function CallProvider({ children }) {
  const { firebaseUser } = useAuth();
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  const [mediaError, setMediaError] = useState("");
  const peers = useRef(new Map());
  const roomIdRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const pendingCandidates = useRef(new Map());
  const callTokenRef = useRef(0);

  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { screenStreamRef.current = screenStream; }, [screenStream]);

  function updateRemoteStream(uid, stream) {
    setRemoteStreams((current) => ({ ...current, [uid]: stream }));
  }

  function removePeer(uid) {
    peers.current.get(uid)?.close();
    peers.current.delete(uid);
    setRemoteStreams((current) => {
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
    localStreamRef.current?.getTracks().forEach((track) => peer.addTrack(track, localStreamRef.current));
    peer.ontrack = (event) => updateRemoteStream(remoteUid, event.streams[0]);
    peer.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(collection(db, "rooms", roomId, "candidates"), {
          from: firebaseUser.uid,
          to: remoteUid,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    if (shouldOffer) {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
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
          if (change.type !== "added" || cancelled) continue;
          const signal = change.doc.data();
          const peer = await createPeer(signal.from, false);
          if (signal.type === "offer") {
            await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
            const queuedCandidates = pendingCandidates.current.get(signal.from) ?? [];
            await Promise.all(queuedCandidates.map((candidate) => peer.addIceCandidate(candidate)));
            pendingCandidates.current.delete(signal.from);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            await setDoc(doc(db, "rooms", roomId, "signals", `${firebaseUser.uid}_${signal.from}_answer`), {
              from: firebaseUser.uid,
              to: signal.from,
              type: "answer",
              sdp: answer.sdp,
            });
          } else if (signal.type === "answer" && !peer.currentRemoteDescription) {
            await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
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

  async function enterCall(roomId) {
    const callToken = ++callTokenRef.current;
    roomIdRef.current = roomId;
    setMediaError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      if (callToken !== callTokenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      await joinRoom(roomId, firebaseUser);
      if (callToken !== callTokenRef.current) {
        await leaveRoom(roomId, firebaseUser.uid);
        stream.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }
    } catch (error) {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
      localStreamRef.current = null;
      roomIdRef.current = null;
      setMediaError(
        error.name === "NotAllowedError"
          ? "Permita microfone e câmera para entrar na sala."
          : error.name === "NotFoundError"
            ? "Nenhuma câmera ou microfone disponível neste dispositivo."
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
      setLocalStream(null);
      setScreenStream(null);
      setRemoteStreams({});
      localStreamRef.current = null;
      screenStreamRef.current = null;
      roomIdRef.current = null;
    }
  }

  useEffect(() => () => { exitCall(); }, []);

  useEffect(() => {
    if (!localStream || !firebaseUser) return undefined;
    const remotes = participants.filter((participant) => participant.uid !== firebaseUser.uid);
    remotes.forEach((participant) => {
      if (firebaseUser.uid < participant.uid) createPeer(participant.uid, true);
    });
    peers.current.forEach((_, uid) => {
      if (!remotes.some((participant) => participant.uid === uid)) removePeer(uid);
    });
    return undefined;
  }, [participants, localStream, firebaseUser]);

  function toggleAudio() {
    const track = localStream?.getAudioTracks()[0];
    if (track) track.enabled = !track.enabled;
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
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = stream.getVideoTracks()[0];
      peers.current.forEach((peer) => {
        const sender = peer.getSenders().find((item) => item.track?.kind === "video");
        if (sender) sender.replaceTrack(screenTrack);
      });
      setScreenStream(stream);
      screenTrack.onended = stopScreenShare;
    } catch (error) {
      if (error.name !== "AbortError") setMediaError(error.message);
    }
  }

  function stopScreenShare() {
    const cameraTrack = localStream?.getVideoTracks()[0];
    peers.current.forEach((peer) => {
      const sender = peer.getSenders().find((item) => item.track?.kind === "video");
      if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
    });
    screenStream?.getTracks().forEach((track) => track.stop());
    setScreenStream(null);
  }

  return (
    <CallContext.Provider value={{ localStream, screenStream, remoteStreams, participants, mediaError, enterCall, exitCall, toggleAudio, toggleVideo, shareScreen }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  return useContext(CallContext);
}