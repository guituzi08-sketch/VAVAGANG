import {
  addDoc,
  collection,
  doc,
  getDoc,
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

console.info("[VOICE DEBUG] REMOTE AUDIO DIAGNOSTIC ACTIVE");

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
      transceivers: transceivers.map((transceiver) => {
        const getTransceiverRole = (transceiver) => transceiver === peer.media?.audioTransceiver ? "voice-audio" : transceiver === peer.media?.screenAudioTransceiver ? "screen-audio" : transceiver === peer.media?.cameraVideoTransceiver ? "camera-video" : transceiver === peer.media?.videoTransceiver ? "screen-video" : "unknown";
        return {
          role: getTransceiverRole(transceiver),
          kind: transceiver.receiver.track?.kind ?? transceiver.sender.track?.kind ?? null,
          direction: transceiver.direction,
          currentDirection: transceiver.currentDirection,
          senderTrackKind: transceiver.sender.track?.kind ?? null,
          receiverTrackKind: transceiver.receiver.track?.kind ?? null
        };
      }),
    connectionState: peer.connectionState,
    iceConnectionState: peer.iceConnectionState,
    iceGatheringState: peer.iceGatheringState,
    signalingState: peer.signalingState,
    outboundAudioBytes: outboundAudio.reduce((total, bytes) => total + bytes, 0),
    inboundAudioBytes: inboundAudio.reduce((total, bytes) => total + bytes, 0),
  });
}

function getAudioDescriptionInfo(description) {
  const audioSection = description?.sdp?.split(/\r?\n(?=m=)/).find((section) => section.startsWith("m=audio"));
  if (!audioSection) return { present: false, direction: null };
  const direction = ["sendrecv", "recvonly", "sendonly", "inactive"].find((value) => new RegExp(`(?:^|\\r?\\n)a=${value}(?:\\r?\\n|$)`).test(audioSection)) ?? "sendrecv";
  return { present: true, direction };
}

function getPeerTransceiverDiagnostics(peer) {
  return peer.getTransceivers().map((transceiver, index) => ({
    index,
    kind: transceiver.receiver.track?.kind ?? transceiver.sender.track?.kind ?? null,
    senderTrackId: transceiver.sender.track?.id ?? null,
    senderTrackKind: transceiver.sender.track?.kind ?? null,
    senderTrackReadyState: transceiver.sender.track?.readyState ?? null,
    receiverTrackId: transceiver.receiver.track?.id ?? null,
    receiverTrackKind: transceiver.receiver.track?.kind ?? null,
    receiverTrackReadyState: transceiver.receiver.track?.readyState ?? null,
    direction: transceiver.direction,
    currentDirection: transceiver.currentDirection,
  }));
}

function logPeerClose(peer, localUserId, reason) {
  if (!peer) return;
  console.warn("[VOICE DEBUG][PEER CLOSE]", {
    roomId: peer.roomId ?? null,
    localUserId,
    remoteUserId: peer.remoteUid ?? null,
    callSessionId: peer.callSessionId ?? null,
    connectionState: peer.connectionState,
    iceConnectionState: peer.iceConnectionState,
    signalingState: peer.signalingState,
    reason,
    stack: new Error().stack,
    timestamp: new Date().toISOString(),
  });
}

function logPeerRecovery(peer, remoteUserId, reason, caller) {
  const connectionState = peer?.connectionState ?? null;
  console.warn("[VOICE DEBUG][PEER RECOVERY]", {
    remoteUserId,
    previousState: connectionState,
    reason,
    timestamp: new Date().toISOString(),
    callSessionId: peer?.callSessionId ?? null,
    connectionState,
    connected: connectionState === "connected",
    disconnected: connectionState === "disconnected",
    failed: connectionState === "failed",
    closed: connectionState === "closed",
    caller,
  });
}

function logPeerDescription(label, peer, remoteUserId, description) {
  console.info(`[VOICE DEBUG][${label}]`, {
    roomId: peer.roomId ?? null,
    localUserId: peer.localUserId ?? null,
    remoteUserId,
    callSessionId: peer.callSessionId ?? null,
    descriptionType: description?.type ?? null,
    signalingState: peer.signalingState,
    timestamp: new Date().toISOString(),
    transceivers: getPeerTransceiverDiagnostics(peer),
  });
}

function debugPeerTransport(peer, remoteUid, peers) {
  const senders = peer.getSenders();
  const receivers = peer.getReceivers();
  const transceivers = peer.getTransceivers();
  const audioReceivers = receivers.filter((receiver) => receiver.track?.kind === "audio");
  const audioSender = senders.find((sender) => sender.track?.kind === "audio");
  const audioTransceivers = transceivers.filter((transceiver) => transceiver.receiver.track?.kind === "audio" || transceiver.sender.track?.kind === "audio");
  console.info("[VOICE DEBUG] REMOTE PEER DIAGNOSTIC", { remoteUserId: remoteUid, connectionState: peer.connectionState, iceConnectionState: peer.iceConnectionState, signalingState: peer.signalingState, sendersLength: senders.length, receiversLength: receivers.length, transceiversLength: transceivers.length });
  console.info("[VOICE DEBUG] REMOTE PEER IDENTIFIED", { remoteUserId: remoteUid, connectionState: peer.connectionState, iceConnectionState: peer.iceConnectionState, signalingState: peer.signalingState });
  console.info("[VOICE DEBUG] SENDERS", { userId: remoteUid, count: senders.length, items: senders.map((sender) => ({ kind: sender.track?.kind ?? null, trackId: sender.track?.id ?? null, readyState: sender.track?.readyState ?? null })) });
  console.info("[VOICE DEBUG] RECEIVERS", { userId: remoteUid, count: receivers.length, items: receivers.map((receiver) => ({ kind: receiver.track?.kind ?? null, trackId: receiver.track?.id ?? null, enabled: receiver.track?.enabled ?? null, muted: receiver.track?.muted ?? null, readyState: receiver.track?.readyState ?? null })) });
  receivers.forEach((receiver) => console.info("[VOICE DEBUG] RECEIVER", { userId: remoteUid, kind: receiver.track?.kind ?? null, trackId: receiver.track?.id ?? null, trackKind: receiver.track?.kind ?? null, enabled: receiver.track?.enabled ?? null, muted: receiver.track?.muted ?? null, readyState: receiver.track?.readyState ?? null }));
  if (!receivers.length) console.warn("[VOICE DEBUG] ZERO REMOTE RECEIVERS", { userId: remoteUid });
  if (audioReceivers.length) console.info("[VOICE DEBUG] REMOTE AUDIO RECEIVER EXISTS", { userId: remoteUid, count: audioReceivers.length });
  console.info("[VOICE DEBUG] TRANSCEIVERS", { userId: remoteUid, items: transceivers.map((transceiver) => ({ kind: transceiver.receiver.track?.kind ?? transceiver.sender.track?.kind ?? null, direction: transceiver.direction, currentDirection: transceiver.currentDirection, senderTrackKind: transceiver.sender.track?.kind ?? null, receiverTrackKind: transceiver.receiver.track?.kind ?? null })) });
  transceivers.forEach((transceiver) => console.info("[VOICE DEBUG] TRANSCEIVER", { userId: remoteUid, kind: transceiver.receiver.track?.kind ?? transceiver.sender.track?.kind ?? null, direction: transceiver.direction, currentDirection: transceiver.currentDirection, senderTrackKind: transceiver.sender.track?.kind ?? null, receiverTrackKind: transceiver.receiver.track?.kind ?? null }));
  if (audioTransceivers.some((transceiver) => [transceiver.currentDirection, transceiver.direction].includes("sendonly") || [transceiver.currentDirection, transceiver.direction].includes("inactive"))) console.warn("[VOICE DEBUG] AUDIO RECEIVING DIRECTION PROBLEM", { userId: remoteUid, directions: audioTransceivers.map((transceiver) => ({ direction: transceiver.direction, currentDirection: transceiver.currentDirection })) });
  console.info("[VOICE DEBUG] LOCAL DESCRIPTION AUDIO", getAudioDescriptionInfo(peer.localDescription));
  console.info("[VOICE DEBUG] REMOTE DESCRIPTION AUDIO", getAudioDescriptionInfo(peer.remoteDescription));
  console.info("[VOICE DEBUG] AUDIO PATH", { userId: remoteUid, sender: Boolean(audioSender), receiver: Boolean(audioReceivers.length), path: `${audioSender ? "SIM" : "NAO"} -> ${audioReceivers.length ? "SIM" : "NAO"}` });
  console.info("[VOICE DEBUG] ONTRACK HANDLER STATUS", { remoteUserId: remoteUid, handlerExists: typeof peer.ontrack === "function", peerConnectionAssociated: peers.get(remoteUid) === peer, ontrackDispatched: peer.remoteTrackReceived === true });
  console.info("[VOICE DEBUG] REMOTE USER AUDIO SEND STATE", { remoteUserId: remoteUid, observedRemoteAudioReceiver: Boolean(audioReceivers.length), remoteAudioTrack: audioReceivers[0]?.track ? { id: audioReceivers[0].track.id, enabled: audioReceivers[0].track.enabled, muted: audioReceivers[0].track.muted, readyState: audioReceivers[0].track.readyState } : null });
  const peerConnectionCount = [...peers.values()].filter((activePeer) => activePeer.remoteUid === remoteUid).length;
  console.info("[VOICE DEBUG] PEER CONNECTION MAP", { remoteUserId: remoteUid, count: peerConnectionCount, items: [...peers.entries()].filter(([, activePeer]) => activePeer.remoteUid === remoteUid).map(([userId, activePeer]) => ({ userId, connectionState: activePeer.connectionState, iceConnectionState: activePeer.iceConnectionState, signalingState: activePeer.signalingState })) });
  if (peerConnectionCount > 1) console.warn("[VOICE DEBUG] DUPLICATE PEER CONNECTION DETECTED", { remoteUserId: remoteUid, count: peerConnectionCount });
  console.info("[VOICE DEBUG] ACTIVE PEER CONNECTIONS", {
    total: peers.size,
    items: [...peers.entries()].map(([userId, activePeer]) => ({ userId, connectionState: activePeer.connectionState, iceConnectionState: activePeer.iceConnectionState, senders: activePeer.getSenders().length, receivers: activePeer.getReceivers().length })),
  });
}

function logVoiceTrack(label, track, userId) {
  console.info(`[VOICE DEBUG] ${label}`, {
    userId,
    kind: track?.kind ?? null,
    trackId: track?.id ?? null,
    enabled: track?.enabled ?? null,
    muted: track?.muted ?? null,
    readyState: track?.readyState ?? null,
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
  const signalingListenerCountRef = useRef(0);
  const candidateListenerCountRef = useRef(0);
  const peerTrackListenerCountRef = useRef(new Map());
  const enterCallPromiseRef = useRef(null);

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
    logPeerClose(peer, firebaseUser?.uid ?? null, "removePeer");
    peer?.close();
    clearTimeout(peer?.remoteTrackDiagnosticTimer);
    peers.current.delete(uid);
    pendingCandidates.current.delete(uid);
    peerTrackListenerCountRef.current.delete(uid);
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

  function schedulePeerRecovery(remoteUid, reason = "connection-state", caller = "unknown") {
    logPeerRecovery(peers.current.get(remoteUid), remoteUid, reason, caller);
    if (reconnectTimers.current.has(remoteUid)) return;
    const timer = setTimeout(() => {
      reconnectTimers.current.delete(remoteUid);
      const participantStillPresent = participantsRef.current.some((participant) => participant.uid === remoteUid);
      const peer = peers.current.get(remoteUid);
      if (!participantStillPresent || !peer || peer.connectionState === "connected") return;
      removePeer(remoteUid);
      if (firebaseUser.uid < remoteUid) createPeer(remoteUid, true, "schedulePeerRecovery").catch((error) => setMediaError(`Falha ao recuperar áudio: ${error.message}`));
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

  async function isCurrentParticipantSession(remoteUid, callSessionId, roomId) {
    if (!callSessionId || roomIdRef.current !== roomId) return false;
    const participantSnapshot = await getDoc(doc(db, "rooms", roomId, "participants", remoteUid));
    return participantSnapshot.exists() && participantSnapshot.data().callSessionId === callSessionId;
  }

  function requestPeerNegotiation(remoteUid, peer) {
    const negotiation = (peer.negotiationChain ?? Promise.resolve()).then(async () => {
      if (peers.current.get(remoteUid) !== peer || peer.closedByApp || peer.signalingState !== "stable" || peer.makingOffer) return;
      peer.makingOffer = true;
      try {
        const offer = await peer.createOffer();
        logPeerDescription("CREATE OFFER", peer, remoteUid, offer);
        logPeerDescription("SET LOCAL DESCRIPTION", peer, remoteUid, offer);
        await peer.setLocalDescription(offer);
        if (peers.current.get(remoteUid) !== peer || peer.closedByApp) return;
        await setDoc(doc(db, "rooms", roomIdRef.current, "signals", `${firebaseUser.uid}_${remoteUid}_offer_${peer.localSessionId}_${Date.now()}`), {
          from: firebaseUser.uid,
          to: remoteUid,
          type: "offer",
          callSessionId: sessionIdRef.current,
          sessionId: peer.localSessionId,
          sdp: offer.sdp,
        });
        console.info("[VOICE DEBUG] offer enviado", { userId: remoteUid, hasAudio: offer.sdp?.includes("m=audio") ?? false });
      } finally {
        peer.makingOffer = false;
      }
    });
    peer.negotiationChain = negotiation.catch((error) => {
      peer.negotiationChain = Promise.resolve();
      throw error;
    });
    return peer.negotiationChain;
  }

  async function createPeer(remoteUid, shouldOffer, caller = "unknown") {
    const existingPeer = peers.current.get(remoteUid);
    const roomId = roomIdRef.current;
    const canReuse = Boolean(existingPeer && existingPeer.roomId === roomId && !existingPeer.closedByApp && existingPeer.connectionState !== "closed");
    if (existingPeer) {
      console.info("[VOICE DEBUG][PEER EXISTING]", {
        roomId,
        localUserId: firebaseUser.uid,
        remoteUserId: remoteUid,
        callSessionId: existingPeer.callSessionId ?? sessionIdRef.current,
        existingConnectionState: existingPeer.connectionState,
        existingIceConnectionState: existingPeer.iceConnectionState,
        existingSignalingState: existingPeer.signalingState,
        reused: canReuse,
        closedExisting: !canReuse,
        createdNew: !canReuse,
        reason: canReuse ? "existing-peer-valid" : existingPeer.roomId !== roomId ? "room-changed" : existingPeer.closedByApp ? "closed-by-app" : existingPeer.connectionState === "closed" ? "connection-closed" : "existing-peer-invalid",
        caller,
        timestamp: new Date().toISOString(),
      });
    }
    if (canReuse) {
      await existingPeer.readyPromise;
      if (shouldOffer && !existingPeer.localDescription) await requestPeerNegotiation(remoteUid, existingPeer);
      return existingPeer;
    }
    if (existingPeer) {
      logPeerClose(existingPeer, firebaseUser.uid, "createPeer-existing-peer-invalid");
      existingPeer.closedByApp = true;
      clearTimeout(existingPeer.remoteTrackDiagnosticTimer);
      existingPeer.close();
      peers.current.delete(remoteUid);
      pendingCandidates.current.delete(remoteUid);
      peerTrackListenerCountRef.current.delete(remoteUid);
    }
    const peer = new RTCPeerConnection(rtcConfig);
    peer.remoteUid = remoteUid;
    peer.roomId = roomId;
    peer.localUserId = firebaseUser.uid;
    peer.callSessionId = sessionIdRef.current;
    peer.peerKey = `${roomId}:${remoteUid}`;
    peer.polite = firebaseUser.uid > remoteUid;
    peer.makingOffer = false;
    peer.ignoreOffer = false;
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
    console.info("[VOICE DEBUG][PEER CREATE]", {
      roomId,
      localUserId: firebaseUser.uid,
      remoteUserId: remoteUid,
      callSessionId: peer.callSessionId,
      peerKey: peer.peerKey,
      timestamp: new Date().toISOString(),
      connectionState: peer.connectionState,
      iceConnectionState: peer.iceConnectionState,
      signalingState: peer.signalingState,
      activePeerCount: peers.current.size,
      hadExistingPeer: Boolean(existingPeer),
      previousConnectionState: existingPeer?.connectionState ?? null,
      previousIceConnectionState: existingPeer?.iceConnectionState ?? null,
      previousSignalingState: existingPeer?.signalingState ?? null,
      reason: !existingPeer ? "no-existing-peer" : "existing-peer-invalid",
      caller,
      audioSenderTrackId: audioSender.track?.id ?? null,
      audioSenderTrackKind: audioSender.track?.kind ?? null,
      audioSenderTrackReadyState: audioSender.track?.readyState ?? null,
      audioTransceivers: getPeerTransceiverDiagnostics(peer).filter((transceiver) => transceiver.kind === "audio"),
      stack: new Error().stack,
    });
    console.info("[VOICE DEBUG] PeerConnection criada", { userId: remoteUid, connectionState: peer.connectionState, iceConnectionState: peer.iceConnectionState, signalingState: peer.signalingState });
    console.info("[VOICE DEBUG] PEER CONNECTION COUNT", { userId: remoteUid, connections: [...peers.current.keys()].filter((uid) => uid === remoteUid).length });
    if ([...peers.current.keys()].filter((uid) => uid === remoteUid).length > 1) console.warn("[VOICE DEBUG] POSSIBLE DUPLICATE PEER CONNECTION", { userId: remoteUid });
    logVoiceTrack("addTrack", audioTrack, remoteUid);
    console.info("[VOICE DEBUG] addTrack transport", { userId: remoteUid, senders: peer.getSenders().length, receivers: peer.getReceivers().length });
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
    const onTrackListenerCount = (peerTrackListenerCountRef.current.get(remoteUid) ?? 0) + 1;
    peerTrackListenerCountRef.current.set(remoteUid, onTrackListenerCount);
    console.info("[VOICE DEBUG] ontrack listeners", { userId: remoteUid, listeners: onTrackListenerCount });
    if (onTrackListenerCount > 1) console.warn("[VOICE DEBUG] POSSIBLE DUPLICATE LISTENER", { type: "ontrack", userId: remoteUid, listeners: onTrackListenerCount });
    peer.remoteTrackReceived = false;
    peer.remoteAudioTrackReceived = false;
    peer.ontrack = (event) => {
      if (peers.current.get(remoteUid) !== peer || peer.closedByApp) return;
      const isScreenTrack = event.transceiver === screenAudioTransceiver || event.transceiver === videoTransceiver;
      const isCameraTrack = event.transceiver === cameraVideoTransceiver;
      const stream = isScreenTrack ? remoteScreenStream : isCameraTrack ? remoteCameraStream : remoteAudioStream;
      peer.remoteTrackReceived = true;
      const transceiverIndex = peer.getTransceivers().indexOf(event.transceiver);
      console.info("[VOICE DEBUG][ONTRACK]", { roomId: peer.roomId, localUserId: peer.localUserId, remoteUserId: remoteUid, callSessionId: peer.callSessionId, transceiverIndex, kind: event.track.kind, trackId: event.track.id, enabled: event.track.enabled, muted: event.track.muted, readyState: event.track.readyState, senderTrackId: event.transceiver?.sender.track?.id ?? null, senderTrackKind: event.transceiver?.sender.track?.kind ?? null, senderTrackReadyState: event.transceiver?.sender.track?.readyState ?? null, receiverTrackId: event.transceiver?.receiver.track?.id ?? null, receiverTrackKind: event.transceiver?.receiver.track?.kind ?? null, receiverTrackReadyState: event.transceiver?.receiver.track?.readyState ?? null, direction: event.transceiver?.direction ?? null, currentDirection: event.transceiver?.currentDirection ?? null, streamsLength: event.streams.length, timestamp: new Date().toISOString() });
      if (event.streams[0]) console.info("[VOICE DEBUG] REMOTE STREAM", { userId: remoteUid, streamId: event.streams[0].id, tracks: event.streams[0].getTracks().length, audioTracks: event.streams[0].getAudioTracks().map((track) => ({ id: track.id, enabled: track.enabled, muted: track.muted, readyState: track.readyState })) });
      if (event.track.kind === "audio") console.info("[VOICE DEBUG] REMOTE AUDIO TRACK", { userId: remoteUid, trackId: event.track.id, enabled: event.track.enabled, muted: event.track.muted, readyState: event.track.readyState, streamId: event.streams[0]?.id ?? null, audioTracks: event.streams[0]?.getAudioTracks().length ?? 0 });
      if (event.track.kind === "audio") peer.remoteAudioTrackReceived = true;
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
    console.info("[VOICE DEBUG] ontrack handler attached", { userId: remoteUid, handler: typeof peer.ontrack });
    peer.onicecandidate = async (event) => {
      if (!event.candidate) return;
      try {
        if (peers.current.get(remoteUid) !== peer || peer.closedByApp) return;
        await addDoc(collection(db, "rooms", roomId, "candidates"), {
          from: firebaseUser.uid,
          to: remoteUid,
          callSessionId: sessionIdRef.current,
          sessionId: peer.localSessionId,
          candidate: event.candidate.toJSON(),
        });
        console.info("[VOICE DEBUG] ICE candidate enviado", { userId: remoteUid });
      } catch (error) {
        setMediaError(`Falha ao enviar ICE candidate: ${error.message}`);
      }
    };
    peer.onconnectionstatechange = () => {
      console.info("[VOICE DEBUG][CONNECTION STATE]", { roomId: peer.roomId, localUserId: peer.localUserId, remoteUserId: remoteUid, callSessionId: peer.callSessionId, state: peer.connectionState, iceConnectionState: peer.iceConnectionState, signalingState: peer.signalingState, timestamp: new Date().toISOString() });
      console.info("[VOICE DEBUG] PeerConnection state", { userId: remoteUid, connectionState: peer.connectionState, iceConnectionState: peer.iceConnectionState, signalingState: peer.signalingState });
      if (peer.connectionState === "connected") {
        debugPeerTransport(peer, remoteUid, peers.current);
        clearTimeout(peer.remoteTrackDiagnosticTimer);
        peer.remoteTrackDiagnosticTimer = setTimeout(() => {
          if (!peer.remoteTrackReceived && peers.current.get(remoteUid) === peer) console.warn("[VOICE DEBUG][NO REMOTE TRACK RECEIVED]", { roomId: peer.roomId, localUserId: peer.localUserId, remoteUserId: remoteUid, callSessionId: peer.callSessionId, windowMs: 10000, timestamp: new Date().toISOString(), connectionState: peer.connectionState, iceConnectionState: peer.iceConnectionState, signalingState: peer.signalingState, transceivers: getPeerTransceiverDiagnostics(peer), localDescriptionAudio: getAudioDescriptionInfo(peer.localDescription), remoteDescriptionAudio: getAudioDescriptionInfo(peer.remoteDescription) });
        }, 10000);
      }
      if (["failed", "disconnected"].includes(peer.connectionState) || ["failed", "disconnected"].includes(peer.iceConnectionState)) schedulePeerRecovery(remoteUid, "connection-or-ice-state", "onconnectionstatechange");
      if (peer.connectionState === "connected") {
        const reconnectTimer = reconnectTimers.current.get(remoteUid);
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimers.current.delete(remoteUid);
      }
    };
    peer.oniceconnectionstatechange = () => {
      console.info("[VOICE DEBUG][ICE CONNECTION STATE]", { roomId: peer.roomId, localUserId: peer.localUserId, remoteUserId: remoteUid, callSessionId: peer.callSessionId, state: peer.iceConnectionState, connectionState: peer.connectionState, signalingState: peer.signalingState, timestamp: new Date().toISOString() });
      if (["failed", "disconnected"].includes(peer.iceConnectionState)) schedulePeerRecovery(remoteUid, "ice-state", "oniceconnectionstatechange");
    };
    peer.onsignalingstatechange = () => {
      console.info("[VOICE DEBUG][SIGNALING STATE]", { roomId: peer.roomId, localUserId: peer.localUserId, remoteUserId: remoteUid, callSessionId: peer.callSessionId, state: peer.signalingState, connectionState: peer.connectionState, iceConnectionState: peer.iceConnectionState, timestamp: new Date().toISOString() });
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
    signalingListenerCountRef.current += 1;
    candidateListenerCountRef.current += 1;
    console.info("[VOICE DEBUG] signaling listeners", { firestore: signalingListenerCountRef.current, iceCandidates: candidateListenerCountRef.current });
    if (signalingListenerCountRef.current > 1 || candidateListenerCountRef.current > 1) console.warn("[VOICE DEBUG] POSSIBLE DUPLICATE LISTENER", { signaling: signalingListenerCountRef.current, iceCandidates: candidateListenerCountRef.current });
    const unsubscribeSignals = onSnapshot(signalsQuery, (snapshot) => enqueueSignal(async () => {
      try {
        for (const change of snapshot.docChanges()) {
          if (change.type !== "added" || cancelled || roomIdRef.current !== roomId) continue;
          const signal = change.doc.data();
          if (signal.from === firebaseUser.uid || !signal.sdp || !signal.sessionId) continue;
          const signalKey = `${change.doc.id}:${signal.type}:${signal.sdp}`;
          if (processedSignals.current.has(signalKey)) continue;
          if (!await isCurrentParticipantSession(signal.from, signal.callSessionId, roomId)) {
            processedSignals.current.add(signalKey);
            continue;
          }
          const peer = await createPeer(signal.from, false, "onSnapshot-signals");
          if (signal.type === "offer") {
            const offerCollision = peer.makingOffer || peer.signalingState !== "stable";
            peer.ignoreOffer = !peer.polite && offerCollision;
            if (peer.ignoreOffer) {
              processedSignals.current.add(signalKey);
              continue;
            }
            if (offerCollision && peer.polite) {
              const rollback = { type: "rollback" };
              logPeerDescription("SET LOCAL DESCRIPTION", peer, signal.from, rollback);
              await peer.setLocalDescription(rollback);
            }
            const remoteOffer = { type: "offer", sdp: signal.sdp };
            logPeerDescription("SET REMOTE DESCRIPTION", peer, signal.from, remoteOffer);
            await peer.setRemoteDescription(remoteOffer);
            peer.remoteSessionId = signal.sessionId ?? null;
            peer.remoteOfferSdp = signal.sdp;
            processedSignals.current.add(signalKey);
            console.info("[VOICE DEBUG] received offer audio", signal.sdp.includes("m=audio"));
            await flushPendingCandidates(signal.from, peer);
            const answer = await peer.createAnswer();
            logPeerDescription("CREATE ANSWER", peer, signal.from, answer);
            logPeerDescription("SET LOCAL DESCRIPTION", peer, signal.from, answer);
            await peer.setLocalDescription(answer);
            console.info("[VOICE DEBUG] answer audio", peer.localDescription?.sdp?.includes("m=audio"));
            await setDoc(doc(db, "rooms", roomId, "signals", `${firebaseUser.uid}_${signal.from}_answer_${peer.localSessionId}`), {
              from: firebaseUser.uid,
              to: signal.from,
              type: "answer",
              callSessionId: sessionIdRef.current,
              sessionId: peer.localSessionId,
              offerSessionId: signal.sessionId ?? null,
              sdp: answer.sdp,
            });
            console.info("[VOICE DEBUG] answer enviado", { userId: signal.from, hasAudio: answer.sdp?.includes("m=audio") ?? false });
          } else if (signal.type === "answer") {
            if (peer.signalingState !== "have-local-offer" || (signal.offerSessionId && signal.offerSessionId !== peer.localSessionId)) {
              processedSignals.current.add(signalKey);
              continue;
            }
            const remoteAnswer = { type: "answer", sdp: signal.sdp };
            logPeerDescription("SET REMOTE DESCRIPTION", peer, signal.from, remoteAnswer);
            await peer.setRemoteDescription(remoteAnswer);
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
          if (change.type !== "added" || cancelled || roomIdRef.current !== roomId) continue;
          const candidate = change.doc.data();
          if (!candidate.sessionId) continue;
          if (processedCandidates.current.has(change.doc.id)) continue;
          if (!await isCurrentParticipantSession(candidate.from, candidate.callSessionId, roomId)) {
            processedCandidates.current.add(change.doc.id);
            continue;
          }
          const peer = await createPeer(candidate.from, false, "onSnapshot-candidates");
          console.info("[VOICE DEBUG] ICE candidate recebido", { userId: candidate.from });
          if (candidate.sessionId && peer.remoteSessionId && candidate.sessionId !== peer.remoteSessionId) {
            processedCandidates.current.add(change.doc.id);
            continue;
          }
          if (peer.remoteDescription) {
            await peer.addIceCandidate(candidate.candidate);
            console.info("[VOICE DEBUG] ICE candidate aplicado", { userId: candidate.from });
            processedCandidates.current.add(change.doc.id);
          } else {
            const queued = pendingCandidates.current.get(candidate.from) ?? [];
            pendingCandidates.current.set(candidate.from, [...queued, { sessionId: candidate.sessionId, candidate: candidate.candidate }]);
            processedCandidates.current.add(change.doc.id);
            console.info("[VOICE DEBUG] ICE candidate enfileirado", { userId: candidate.from });
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
      signalingListenerCountRef.current -= 1;
      candidateListenerCountRef.current -= 1;
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

  async function enterCallOnce(roomId) {
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
      console.info("[VOICE DEBUG] getUserMedia iniciado");
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioTracks = stream.getAudioTracks();
      console.info("[VOICE DEBUG] local stream criada", { streamId: stream.id, tracks: stream.getTracks().length, audioTracks: audioTracks.length });
      audioTracks.forEach((track) => logVoiceTrack("local audio track", track, firebaseUser.uid));
      if (!audioTracks.length) throw new Error("O microfone não forneceu uma faixa de áudio.");
      if (callToken !== callTokenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      await joinRoom(room.id, firebaseUser, profile, sessionIdRef.current);
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

  async function enterCall(roomId) {
    if (enterCallPromiseRef.current) return enterCallPromiseRef.current;
    const promise = enterCallOnce(roomId);
    enterCallPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      if (enterCallPromiseRef.current === promise) enterCallPromiseRef.current = null;
    }
  }

  async function exitCall() {
    ++callTokenRef.current;
    const roomId = roomIdRef.current;
    try {
      if (roomId && firebaseUser) await leaveRoom(roomId, firebaseUser.uid);
    } finally {
      peers.current.forEach((peer) => {
        logPeerClose(peer, firebaseUser?.uid ?? null, "exitCall");
        peer.closedByApp = true;
        peer.close();
      });
      peers.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      pendingCandidates.current.clear();
      processedCandidates.current.clear();
      signalQueue.current = Promise.resolve();
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
      if (firebaseUser.uid < participant.uid) createPeer(participant.uid, true, "participants-effect").catch((error) => setMediaError(`Falha ao conectar participante: ${error.message}`));
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