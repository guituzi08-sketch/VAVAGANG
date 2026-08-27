import { createContext, useContext, useEffect, useRef, useState } from "react";
import { db } from "../firebase";
import { getRoom, joinRoom, leaveRoom, subscribeToParticipants, subscribeToRoom, updateParticipantState } from "../services/roomService";
import { requestCamera, requestMicrophone, requestScreen, stopMediaStream } from "../voice/localMediaManager";
import { PeerConnectionManager } from "../voice/peerConnectionManager";
import { subscribeToSignaling } from "../voice/signalingService";
import { CALL_STATES, createSessionId } from "../voice/voiceState";
import { useAuth } from "./AuthContext";

const CallContext = createContext(null);
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

  function reportError(error, remoteUid) {
    setMediaError(error?.message || "Não foi possível conectar à sala de voz.");
    if (!remoteUid) setCallState(CALL_STATES.FAILED);
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
      setCallState(CALL_STATES.REQUESTING_MEDIA); setMediaError("");
      const room = await getRoom(roomId); if (!room) throw new Error("Esta sala não existe mais.");
      const callSessionId = createSessionId(); const stream = await requestMicrophone();
      localStreamRef.current = stream; setLocalStream(stream); setCallState(CALL_STATES.MEDIA_READY);
      await joinRoom(room.id, firebaseUser, profile, callSessionId);
      sessionRef.current = { roomId: room.id, callSessionId }; setActiveRoomId(room.id); setCallState(CALL_STATES.JOINING);
      const manager = new PeerConnectionManager({ db, roomId: room.id, localUid: firebaseUser.uid, callSessionId, localStream: stream, rtcConfig, onRemoteStream: setRemoteStream, onPeerState: (_, state) => { if (state === "connected") setCallState(CALL_STATES.CONNECTED); if (["failed", "disconnected"].includes(state)) setCallState(CALL_STATES.RECONNECTING); }, onError: reportError });
      managerRef.current = manager;
      const unsubscribeParticipants = subscribeToParticipants(room.id, (next) => { setParticipants(next); manager.syncParticipants(next); }, reportError);
      const unsubscribeSignals = subscribeToSignaling(db, room.id, firebaseUser.uid, { onSignal: (signal) => manager.handleSignal(signal).catch((error) => reportError(error, signal.from)), onCandidate: (candidate) => manager.handleCandidate(candidate).catch((error) => reportError(error, candidate.from)), onError: reportError });
      const unsubscribeRoom = subscribeToRoom(room.id, (currentRoom) => { if (!currentRoom || currentRoom.status === "closed") { setRoomClosed(true); setRoomClosedMessage(currentRoom ? "Esta sala foi encerrada pelo proprietário." : "Esta sala não existe mais."); leaveCurrentRoom(); } }, reportError);
      cleanupRef.current = () => { unsubscribeParticipants(); unsubscribeSignals(); unsubscribeRoom(); }; setCallState(CALL_STATES.CONNECTED);
    }).catch(async (error) => { if (sessionRef.current) await leaveCurrentRoom(); else clearSession(); reportError(error); });
    return operationRef.current;
  }
  async function exitCall() { operationRef.current = operationRef.current.then(() => leaveCurrentRoom()).catch(reportError); return operationRef.current; }
  async function toggleAudio() { const track = localStreamRef.current?.getAudioTracks()[0]; if (!track) return false; track.enabled = !track.enabled; if (sessionRef.current && firebaseUser) await updateParticipantState(sessionRef.current.roomId, firebaseUser.uid, { muted: !track.enabled }).catch(reportError); return track.enabled; }
  async function startCamera() { if (cameraStreamRef.current) return true; try { const stream = await requestCamera(); cameraStreamRef.current = stream; setCameraStream(stream); await managerRef.current?.replaceTrack("camera", stream.getVideoTracks()[0]); if (sessionRef.current && firebaseUser) await updateParticipantState(sessionRef.current.roomId, firebaseUser.uid, { cameraEnabled: true }); return true; } catch (error) { reportError(error); return false; } }
  async function stopCamera() { await managerRef.current?.replaceTrack("camera", null); stopMediaStream(cameraStreamRef.current); cameraStreamRef.current = null; setCameraStream(null); if (sessionRef.current && firebaseUser) await updateParticipantState(sessionRef.current.roomId, firebaseUser.uid, { cameraEnabled: false }).catch(reportError); }
  async function shareScreen() { if (screenStreamRef.current) return stopScreenShare(); try { const stream = await requestScreen(); screenStreamRef.current = stream; setScreenStream(stream); await managerRef.current?.replaceTrack("screen", stream.getVideoTracks()[0]); await managerRef.current?.replaceTrack("screenAudio", stream.getAudioTracks()[0] ?? null); if (sessionRef.current && firebaseUser) await updateParticipantState(sessionRef.current.roomId, firebaseUser.uid, { screenSharing: true, screenAudio: Boolean(stream.getAudioTracks().length) }); stream.getVideoTracks()[0].onended = stopScreenShare; } catch (error) { reportError(error); } }
  async function stopScreenShare() { await managerRef.current?.replaceTrack("screen", null); await managerRef.current?.replaceTrack("screenAudio", null); stopMediaStream(screenStreamRef.current); screenStreamRef.current = null; setScreenStream(null); if (sessionRef.current && firebaseUser) await updateParticipantState(sessionRef.current.roomId, firebaseUser.uid, { screenSharing: false, screenAudio: false }).catch(reportError); }
  useEffect(() => () => { clearSession(); }, []);
  const toggleVideo = async () => { if (cameraStreamRef.current) { await stopCamera(); return false; } await startCamera(); return true; };
  return <CallContext.Provider value={{ localStream, cameraStream, screenStream, remoteStreams, remoteCameraStreams, remoteScreenStreams, participants, mediaError, roomClosed, roomClosedMessage, activeRoomId, callState, isConnecting: [CALL_STATES.REQUESTING_MEDIA, CALL_STATES.MEDIA_READY, CALL_STATES.JOINING].includes(callState), enterCall, exitCall, toggleAudio, toggleVideo, startCamera, stopCamera, shareScreen, stopScreenShare }}>{children}</CallContext.Provider>;
}

export function useCall() { return useContext(CallContext); }
