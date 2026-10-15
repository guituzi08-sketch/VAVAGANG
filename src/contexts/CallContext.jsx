import { createContext, useContext, useEffect, useRef, useState } from "react";
import { db } from "../firebase";
import { getRoom, joinRoom, leaveRoom, refreshParticipantPresence, subscribeToParticipants, subscribeToRoom, updateParticipantState } from "../services/roomService";
import { requestCamera, requestMicrophone, requestScreen, stopMediaStream } from "../voice/localMediaManager";
import { PeerConnectionManager } from "../voice/peerConnectionManager";
import { subscribeToSignaling } from "../voice/signalingService";
import { CALL_STATES, createSessionId } from "../voice/voiceState";
import { useAuth } from "./AuthContext";

const CallContext = createContext(null);
const PARTICIPANT_TIMEOUT_MS = 45_000;
const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, ...(import.meta.env.VITE_TURN_URL ? [{ urls: import.meta.env.VITE_TURN_URL, username: import.meta.env.VITE_TURN_USERNAME, credential: import.meta.env.VITE_TURN_CREDENTIAL }] : [])], iceCandidatePoolSize: 10 };

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
  const [callState, setCallState] = useState(CALL_STATES.IDLE);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const sessionRef = useRef(null);
  const managerRef = useRef(null);
  const localStreamRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const cleanupRef = useRef(null);
  const operationRef = useRef(Promise.resolve());
  const cameraCaptureRef = useRef(false);
  const screenCaptureRef = useRef(false);

  function reportError(error, remoteUid, failCall = true) {
    const message = error?.name === "NotAllowedError"
      ? "Permita o uso do microfone nas permissões do navegador."
      : error?.name === "NotFoundError"
        ? "Nenhum microfone disponível foi encontrado."
        : error?.message || "Não foi possível conectar à sala de voz.";
    setMediaError(message);
    if (!remoteUid && failCall) setCallState(CALL_STATES.FAILED);
  }
  function reportMediaError(error, deviceName) {
    const message = error?.name === "NotAllowedError"
      ? `Permita o acesso à ${deviceName} nas permissões do navegador.`
      : error?.name === "NotFoundError"
        ? `Nenhum dispositivo de ${deviceName} foi encontrado.`
        : error?.message || `Não foi possível iniciar a captura da ${deviceName}.`;
    setMediaError(message);
  }
  function setRemoteStream(uid, streams) {
    if (!streams) {
      setRemoteStreams((current) => { const next = { ...current }; delete next[uid]; return next; });
      setRemoteCameraStreams((current) => { const next = { ...current }; delete next[uid]; return next; });
      setRemoteScreenStreams((current) => { const next = { ...current }; delete next[uid]; return next; });
      return;
    }
    setRemoteStreams((current) => { const next = { ...current }; if (streams.audio?.getAudioTracks().length) next[uid] = streams.audio; else delete next[uid]; return next; });
    setRemoteCameraStreams((current) => { const next = { ...current }; if (streams.camera?.getVideoTracks().length) next[uid] = streams.camera; else delete next[uid]; return next; });
    setRemoteScreenStreams((current) => { const next = { ...current }; if (streams.screen?.getVideoTracks().length) next[uid] = streams.screen; else delete next[uid]; return next; });
  }
  function clearSession() {
    cleanupRef.current?.(); cleanupRef.current = null; managerRef.current?.close(); managerRef.current = null;
    stopMediaStream(localStreamRef.current); stopMediaStream(cameraStreamRef.current); stopMediaStream(screenStreamRef.current);
    localStreamRef.current = null; cameraStreamRef.current = null; screenStreamRef.current = null;
    setLocalStream(null); setCameraStream(null); setScreenStream(null); setRemoteStreams({}); setRemoteCameraStreams({}); setRemoteScreenStreams({}); setParticipants([]); sessionRef.current = null; setActiveRoomId(null);
  }
  async function leaveCurrentRoom() {
    const session = sessionRef.current;
    if (!session) { clearSession(); return; }
    setCallState(CALL_STATES.LEAVING); sessionRef.current = null;
    try { await leaveRoom(session.roomId, firebaseUser?.uid, session.callSessionId); } catch (error) { reportError(error); }
    clearSession(); setCallState(CALL_STATES.ENDED);
  }
  async function enterCall(roomId) {
    operationRef.current = operationRef.current.then(async () => {
      if (!firebaseUser || !roomId || sessionRef.current?.roomId === roomId) return;
      if (sessionRef.current) await leaveCurrentRoom();
      setCallState(CALL_STATES.REQUESTING_MEDIA); setMediaError(""); setRoomClosed(false); setRoomClosedMessage("");
      const room = await getRoom(roomId); if (!room) throw new Error("Esta sala não existe mais.");
      const callSessionId = createSessionId(); const stream = await requestMicrophone();
      localStreamRef.current = stream; setLocalStream(stream); setCallState(CALL_STATES.MEDIA_READY);
      await joinRoom(room.id, firebaseUser, profile, callSessionId);
      sessionRef.current = { roomId: room.id, callSessionId }; setActiveRoomId(room.id); setCallState(CALL_STATES.JOINING);
      const manager = new PeerConnectionManager({ db, roomId: room.id, localUid: firebaseUser.uid, callSessionId, localStream: stream, rtcConfig, onRemoteStream: setRemoteStream, onPeerState: (_, state) => { if (state === "connected") setCallState(CALL_STATES.CONNECTED); if (["failed", "disconnected"].includes(state)) setCallState(CALL_STATES.RECONNECTING); }, onError: reportError });
      managerRef.current = manager;
      const unsubscribeParticipants = subscribeToParticipants(room.id, (next) => {
        const now = Date.now();
        const activeParticipants = next.filter((participant) => {
          const lastSeen = participant.lastSeen?.toMillis?.() ?? participant.lastSeen;
          return typeof lastSeen === "number" && now - lastSeen <= PARTICIPANT_TIMEOUT_MS;
        });
        setParticipants(activeParticipants);
        manager.syncParticipants(activeParticipants);
      }, reportError);
      const unsubscribeSignals = subscribeToSignaling(db, room.id, firebaseUser.uid, { onSignal: (signal) => manager.handleSignal(signal).catch((error) => reportError(error, signal.from)), onCandidate: (candidate) => manager.handleCandidate(candidate).catch((error) => reportError(error, candidate.from)), onError: reportError });
      const unsubscribeRoom = subscribeToRoom(room.id, (currentRoom) => { if (!currentRoom || currentRoom.status === "closed") { setRoomClosed(true); setRoomClosedMessage(currentRoom ? "Esta sala foi encerrada pelo proprietário." : "Esta sala não existe mais."); leaveCurrentRoom(); } }, reportError);
      const presenceTimer = window.setInterval(() => {
        refreshParticipantPresence(room.id, firebaseUser.uid).catch((error) => reportError(error, null, false));
      }, 15_000);
      cleanupRef.current = () => { window.clearInterval(presenceTimer); unsubscribeParticipants(); unsubscribeSignals(); unsubscribeRoom(); }; setCallState(CALL_STATES.CONNECTED);
    }).catch(async (error) => { if (sessionRef.current) await leaveCurrentRoom(); else clearSession(); reportError(error); });
    return operationRef.current;
  }
  async function exitCall() { operationRef.current = operationRef.current.then(() => leaveCurrentRoom()).catch(reportError); return operationRef.current; }
  async function toggleAudio() { const track = localStreamRef.current?.getAudioTracks()[0]; if (!track) return false; track.enabled = !track.enabled; if (sessionRef.current && firebaseUser) await updateParticipantState(sessionRef.current.roomId, firebaseUser.uid, { muted: !track.enabled }).catch((error) => reportError(error, null, false)); return track.enabled; }
  async function startCamera() {
    if (cameraStreamRef.current) return true;
    if (cameraCaptureRef.current) return false;
    const session = sessionRef.current;
    const manager = managerRef.current;
    if (!session || !manager) {
      reportError(new Error("Entre na sala antes de ligar a câmera."), null, false);
      return false;
    }
    cameraCaptureRef.current = true;
    let stream;
    try {
      stream = await requestCamera();
      if (sessionRef.current !== session || managerRef.current !== manager) {
        stopMediaStream(stream);
        return false;
      }
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error("A câmera não forneceu uma faixa de vídeo.");
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      track.onended = () => { stopCamera().catch(reportError); };
      await manager.replaceTrack("camera", track);
      if (sessionRef.current === session) {
        await updateParticipantState(session.roomId, firebaseUser.uid, { cameraEnabled: true })
          .catch((error) => reportError(error, null, false));
      }
      return true;
    } catch (error) {
      stopMediaStream(stream);
      await Promise.allSettled([manager.replaceTrack("camera", null)]);
      if (cameraStreamRef.current === stream) {
        cameraStreamRef.current = null;
        setCameraStream(null);
      }
      if (sessionRef.current === session) {
        await updateParticipantState(session.roomId, firebaseUser.uid, { cameraEnabled: false }).catch((stateError) => reportError(stateError, null, false));
        reportMediaError(error, "câmera");
      }
      return false;
    } finally {
      cameraCaptureRef.current = false;
    }
  }
  async function stopCamera() {
    const stream = cameraStreamRef.current;
    const session = sessionRef.current;
    const manager = managerRef.current;
    cameraStreamRef.current = null;
    setCameraStream(null);
    stopMediaStream(stream);
    const results = await Promise.allSettled([manager?.replaceTrack("camera", null)]);
    results.filter((result) => result.status === "rejected").forEach((result) => reportError(result.reason, null, false));
    if (session && sessionRef.current === session && firebaseUser) {
      await updateParticipantState(session.roomId, firebaseUser.uid, { cameraEnabled: false }).catch((error) => reportError(error, null, false));
    }
  }
  async function shareScreen() {
    if (screenCaptureRef.current) return;
    if (screenStreamRef.current) return stopScreenShare();
    const session = sessionRef.current;
    const manager = managerRef.current;
    if (!session || !manager) {
      reportError(new Error("Entre na sala antes de compartilhar a tela."), null, false);
      return;
    }
    screenCaptureRef.current = true;
    let stream;
    let videoTrack;
    try {
      stream = await requestScreen();
      if (sessionRef.current !== session || managerRef.current !== manager) {
        stopMediaStream(stream);
        return;
      }
      videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("A captura não forneceu uma faixa de vídeo.");
      screenStreamRef.current = stream;
      setScreenStream(stream);
      await manager.replaceTrack("screen", videoTrack);
      const audioTrack = stream.getAudioTracks()[0] ?? null;
      await manager.replaceTrack("screenAudio", audioTrack);
      if (sessionRef.current === session && firebaseUser) {
        await updateParticipantState(session.roomId, firebaseUser.uid, {
          screenSharing: true,
          screenAudio: Boolean(audioTrack),
        }).catch((error) => reportError(error, null, false));
      }
      videoTrack.onended = () => { stopScreenShare().catch(reportError); };
    } catch (error) {
      videoTrack?.stop();
      await Promise.allSettled([
        manager.replaceTrack("screen", null),
        manager.replaceTrack("screenAudio", null),
      ]);
      stopMediaStream(stream);
      if (screenStreamRef.current === stream) {
        screenStreamRef.current = null;
        setScreenStream(null);
      }
      if (sessionRef.current === session && firebaseUser) {
        await updateParticipantState(session.roomId, firebaseUser.uid, {
          screenSharing: false,
          screenAudio: false,
        }).catch((stateError) => reportError(stateError, null, false));
      }
      if (sessionRef.current === session && !["AbortError", "NotAllowedError"].includes(error?.name)) {
        reportMediaError(error, "tela");
      }
    } finally {
      screenCaptureRef.current = false;
    }
  }
  async function stopScreenShare() {
    const stream = screenStreamRef.current;
    const session = sessionRef.current;
    const manager = managerRef.current;
    screenStreamRef.current = null;
    setScreenStream(null);
    stopMediaStream(stream);
    const results = await Promise.allSettled([
      manager?.replaceTrack("screen", null),
      manager?.replaceTrack("screenAudio", null),
    ]);
    results.filter((result) => result.status === "rejected").forEach((result) => reportError(result.reason, null, false));
    if (session && sessionRef.current === session && firebaseUser) {
      await updateParticipantState(session.roomId, firebaseUser.uid, {
        screenSharing: false,
        screenAudio: false,
      }).catch((error) => reportError(error, null, false));
    }
  }
  useEffect(() => () => {
    const session = sessionRef.current;
    if (session && firebaseUser) leaveRoom(session.roomId, firebaseUser.uid, session.callSessionId).catch(reportError);
    clearSession();
  }, [firebaseUser]);
  const toggleVideo = async () => { if (cameraStreamRef.current) { await stopCamera(); return false; } await startCamera(); return true; };
  return <CallContext.Provider value={{ localStream, cameraStream, screenStream, remoteStreams, remoteCameraStreams, remoteScreenStreams, participants, mediaError, roomClosed, roomClosedMessage, activeRoomId, callState, isConnecting: [CALL_STATES.REQUESTING_MEDIA, CALL_STATES.MEDIA_READY, CALL_STATES.JOINING].includes(callState), enterCall, exitCall, toggleAudio, toggleVideo, startCamera, stopCamera, shareScreen, stopScreenShare }}>{children}</CallContext.Provider>;
}

export function useCall() { return useContext(CallContext); }
