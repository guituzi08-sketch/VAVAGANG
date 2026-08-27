import { sendCandidate, sendSignal } from "./signalingService.js";
import { createSessionId, PEER_STATES } from "./voiceState.js";

const ICE_RESTART_DELAY = 1500;

function peerKey(firstUid, secondUid) {
  return [firstUid, secondUid].sort().join("::");
}

function isMLineOrderError(error) {
  return /m-lines|m line|order of m-lines/i.test(error?.message ?? "");
}

export class PeerConnectionManager {
  constructor({ db, roomId, localUid, callSessionId, localStream, rtcConfig, onRemoteStream, onPeerState, onError }) {
    this.db = db;
    this.roomId = roomId;
    this.localUid = localUid;
    this.callSessionId = callSessionId;
    this.localStream = localStream;
    this.rtcConfig = rtcConfig;
    this.onRemoteStream = onRemoteStream;
    this.onPeerState = onPeerState;
    this.onError = onError;
    this.peers = new Map();
    this.creationLocks = new Map();
    this.participantSessions = new Map();
    this.unknownSignals = new Map();
  }

  reportPeerError(error, remoteUid) {
    this.onError(error, remoteUid);
  }

  async ensurePeer(remoteUid, shouldOffer = false) {
    const current = this.peers.get(remoteUid);
    if (current && current.pc.connectionState !== PEER_STATES.CLOSED) {
      if (shouldOffer && !current.pc.localDescription) await this.negotiate(current);
      return current;
    }
    if (this.creationLocks.has(remoteUid)) {
      const peer = await this.creationLocks.get(remoteUid);
      if (shouldOffer && !peer.pc.localDescription) await this.negotiate(peer);
      return peer;
    }
    const lock = this.createPeer(remoteUid, shouldOffer);
    this.creationLocks.set(remoteUid, lock);
    try { return await lock; } finally { if (this.creationLocks.get(remoteUid) === lock) this.creationLocks.delete(remoteUid); }
  }

  async createPeer(remoteUid, shouldOffer) {
    const pc = new RTCPeerConnection(this.rtcConfig ?? { iceServers: [{ urls: "stun:stun.l.google.com:19302" }], iceCandidatePoolSize: 10 });
    const state = { remoteUid, peerKey: peerKey(this.localUid, remoteUid), pc, participantSessionId: this.participantSessions.get(remoteUid) ?? null, polite: this.localUid > remoteUid, makingOffer: false, ignoreOffer: false, remoteDescriptionSet: false, pendingCandidates: [], processedCandidates: new Set(), negotiation: Promise.resolve(), signaling: Promise.resolve(), localSessionId: createSessionId(), localOfferId: null, localOfferRevision: 0, remoteOfferRevision: 0, remoteSessionId: null, remoteAudioStream: new MediaStream(), remoteCameraStream: new MediaStream(), remoteScreenStream: new MediaStream(), closed: false };
    this.peers.set(remoteUid, state);
    const localAudioTrack = this.localStream.getAudioTracks()[0] ?? null;
    const audioSender = localAudioTrack ? pc.addTrack(localAudioTrack, this.localStream) : null;
    const audio = audioSender ? pc.getTransceivers().find((transceiver) => transceiver.sender === audioSender) : pc.addTransceiver("audio", { direction: "sendrecv" });
    const screenAudio = pc.addTransceiver("audio", { direction: "sendrecv" });
    const camera = pc.addTransceiver("video", { direction: "sendrecv" });
    const screen = pc.addTransceiver("video", { direction: "sendrecv" });
    state.transceivers = { audio, camera, screen, screenAudio };
    if (!audioSender) await audio.sender.replaceTrack(null);
    pc.ontrack = (event) => this.handleTrack(state, event);
    pc.onicecandidate = ({ candidate }) => candidate && sendCandidate(this.db, this.roomId, { from: this.localUid, to: remoteUid, peerKey: state.peerKey, callSessionId: this.callSessionId, sessionId: state.localSessionId, candidate: candidate.toJSON() }).then(() => console.info("[WebRTC] ICE sent", { localUser: this.localUid, remoteUser: remoteUid, peerKey: state.peerKey, callSessionId: this.callSessionId })).catch((error) => this.reportPeerError(error, remoteUid));
    pc.onconnectionstatechange = () => {
      console.info("[WebRTC] peer state", { localUser: this.localUid, remoteUser: remoteUid, peerKey: state.peerKey, signalingState: pc.signalingState, connectionState: pc.connectionState, iceConnectionState: pc.iceConnectionState });
      this.handleConnectionState(state);
    };
    pc.oniceconnectionstatechange = () => {
      console.info("[WebRTC] ICE state", { localUser: this.localUid, remoteUser, peerKey: state.peerKey, callSessionId: this.callSessionId, iceConnectionState: pc.iceConnectionState, signalingState: pc.signalingState, connectionState: pc.connectionState });
      if (["failed", "disconnected"].includes(pc.iceConnectionState)) this.recover(state);
    };
    if (shouldOffer) await this.negotiate(state);
    return state;
  }

  handleTrack(state, event) {
    const { audio, camera, screen, screenAudio } = state.transceivers;
    const isCameraTrack = event.transceiver === camera;
    const isScreenTrack = event.transceiver === screen || event.transceiver === screenAudio;
    const isAudioTrack = event.transceiver === audio;
    const target = isCameraTrack ? state.remoteCameraStream : isScreenTrack ? state.remoteScreenStream : state.remoteAudioStream;
    console.info("[WebRTC] remote audio track", { localUser: this.localUid, remoteUser: state.remoteUid, peerKey: state.peerKey, trackKind: event.track.kind, trackId: event.track.id, transceiver: isAudioTrack ? "microphone" : isCameraTrack ? "camera" : event.transceiver === screenAudio ? "screen-audio" : event.transceiver === screen ? "screen-video" : "unknown" });
    target.getTracks().filter((track) => track.id !== event.track.id && track.kind === event.track.kind).forEach((track) => target.removeTrack(track));
    if (!target.getTracks().some((track) => track.id === event.track.id)) target.addTrack(event.track);
    this.onRemoteStream(state.remoteUid, { audio: state.remoteAudioStream, camera: state.remoteCameraStream, screen: state.remoteScreenStream });
    event.track.onended = () => { if (target.getTracks().some((track) => track.id === event.track.id)) target.removeTrack(event.track); this.onRemoteStream(state.remoteUid, { audio: state.remoteAudioStream, camera: state.remoteCameraStream, screen: state.remoteScreenStream }); };
  }

  async negotiate(state, iceRestart = false) {
    state.negotiation = state.negotiation.then(async () => {
      if (state.closed || state.pc.signalingState !== "stable" || state.makingOffer) return;
      state.makingOffer = true;
      try {
        const offer = await state.pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
        await state.pc.setLocalDescription(offer);
        state.localOfferId = createSessionId();
        state.localOfferRevision += 1;
        console.info("[WebRTC] offer", { localUser: this.localUid, remoteUser: state.remoteUid, peerKey: state.peerKey, callSessionId: this.callSessionId, offerId: state.localOfferId, offerRevision: state.localOfferRevision, signalingState: state.pc.signalingState });
        await sendSignal(this.db, this.roomId, { from: this.localUid, to: state.remoteUid, peerKey: state.peerKey, type: "offer", callSessionId: this.callSessionId, sessionId: state.localSessionId, offerId: state.localOfferId, offerRevision: state.localOfferRevision, sdp: offer.sdp });
      } finally { state.makingOffer = false; }
    }).catch((error) => this.reportPeerError(error, state.remoteUid));
    return state.negotiation;
  }

  async handleSignal(signal) {
    if (signal.from === this.localUid) return;
    if (!this.participantSessions.has(signal.from)) {
      const queued = this.unknownSignals.get(signal.from) ?? [];
      if (!queued.some((item) => item.id === signal.id)) this.unknownSignals.set(signal.from, [...queued, signal]);
      return;
    }
    if (this.participantSessions.get(signal.from) !== signal.callSessionId) return;
    const state = await this.ensurePeer(signal.from);
    state.signaling = state.signaling.then(async () => {
      if (signal.peerKey && signal.peerKey !== state.peerKey) {
        console.warn("[WebRTC] signal ignored: wrong peerKey", { localUser: this.localUid, remoteUser: signal.from, expectedPeerKey: state.peerKey, receivedPeerKey: signal.peerKey });
        return;
      }
      try {
        if (signal.type === "offer") await this.handleOffer(state, signal);
        if (signal.type === "answer") await this.handleAnswer(state, signal);
      } catch (error) {
        if (!isMLineOrderError(error) || signal.type !== "offer") throw error;
        console.warn("[WebRTC] m-line order mismatch; recreating peer", { localUser: this.localUid, remoteUser: signal.from, peerKey: state.peerKey, callSessionId: this.callSessionId, signalingState: state.pc.signalingState, connectionState: state.pc.connectionState, iceConnectionState: state.pc.iceConnectionState });
        this.removePeer(signal.from);
        const replacement = await this.ensurePeer(signal.from);
        await this.handleOffer(replacement, signal);
      }
    }).catch((error) => this.reportPeerError(error, state.remoteUid));
    return state.signaling;
  }

  async handleOffer(state, signal) {
    const offerRevision = Number(signal.offerRevision ?? 0);
    if (state.remoteSessionId && signal.sessionId !== state.remoteSessionId) {
      console.warn("[WebRTC] stale offer ignored: wrong remote session", { localUser: this.localUid, remoteUser: state.remoteUid, peerKey: state.peerKey, expectedSessionId: state.remoteSessionId, receivedSessionId: signal.sessionId });
      return;
    }
    if (offerRevision && offerRevision <= state.remoteOfferRevision) {
      console.warn("[WebRTC] stale offer ignored: old revision", { localUser: this.localUid, remoteUser: state.remoteUid, peerKey: state.peerKey, offerRevision, lastOfferRevision: state.remoteOfferRevision });
      return;
    }
    const collision = state.makingOffer || state.pc.signalingState !== "stable";
    state.ignoreOffer = !state.polite && collision;
    if (state.ignoreOffer) return;
    if (collision) await state.pc.setLocalDescription({ type: "rollback" });
    await state.pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
    state.remoteDescriptionSet = true;
    state.remoteSessionId = signal.sessionId;
    state.remoteOfferRevision = offerRevision;
    await this.flushCandidates(state);
    const answer = await state.pc.createAnswer();
    await state.pc.setLocalDescription(answer);
    console.info("[WebRTC] answer", { localUser: this.localUid, remoteUser: state.remoteUid, peerKey: state.peerKey, callSessionId: this.callSessionId, offerId: signal.offerId ?? signal.sessionId, offerRevision, signalingState: state.pc.signalingState });
    await sendSignal(this.db, this.roomId, { from: this.localUid, to: state.remoteUid, peerKey: state.peerKey, type: "answer", callSessionId: this.callSessionId, sessionId: state.localSessionId, offerId: signal.offerId ?? signal.sessionId, offerRevision, sdp: answer.sdp });
  }

  async handleAnswer(state, signal) {
    if (signal.offerId !== state.localOfferId || (signal.offerRevision && Number(signal.offerRevision) !== state.localOfferRevision) || state.pc.signalingState !== "have-local-offer") return;
    console.info("[WebRTC] answer received", { localUser: this.localUid, remoteUser: state.remoteUid, peerKey: state.peerKey, callSessionId: this.callSessionId, offerId: signal.offerId, offerRevision: signal.offerRevision ?? 0, signalingState: state.pc.signalingState });
    await state.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
    state.remoteDescriptionSet = true;
    state.remoteSessionId = signal.sessionId;
    await this.flushCandidates(state);
  }

  async handleCandidate(candidate) {
    if (candidate.from === this.localUid) return;
    const expectedPeerKey = peerKey(this.localUid, candidate.from);
    console.info("[WebRTC] ICE received", { localUser: this.localUid, remoteUser: candidate.from, peerKey: expectedPeerKey, callSessionId: candidate.callSessionId, candidateSessionId: candidate.sessionId });
    if (candidate.peerKey && candidate.peerKey !== expectedPeerKey) {
      console.warn("[WebRTC] ICE ignored: wrong peerKey", { localUser: this.localUid, remoteUser: candidate.from, expectedPeerKey, receivedPeerKey: candidate.peerKey });
      return;
    }
    if (!this.participantSessions.has(candidate.from)) {
      const queued = this.unknownSignals.get(candidate.from) ?? [];
      if (!queued.some((item) => item.id === candidate.id)) this.unknownSignals.set(candidate.from, [...queued, candidate]);
      return;
    }
    if (this.participantSessions.get(candidate.from) !== candidate.callSessionId) return;
    const state = await this.ensurePeer(candidate.from);
    state.signaling = state.signaling.then(async () => {
      if (state.processedCandidates.has(candidate.id)) return;
      state.processedCandidates.add(candidate.id);
      if (state.remoteSessionId && candidate.sessionId !== state.remoteSessionId) {
        console.warn("[WebRTC] ICE ignored: stale remote session", { localUser: this.localUid, remoteUser: state.remoteUid, peerKey: state.peerKey, expectedSessionId: state.remoteSessionId, receivedSessionId: candidate.sessionId });
        return;
      }
      if (!state.remoteDescriptionSet) state.pendingCandidates.push(candidate);
      else await state.pc.addIceCandidate(candidate.candidate).then(() => console.info("[WebRTC] ICE applied", { localUser: this.localUid, remoteUser: state.remoteUid, peerKey: state.peerKey, callSessionId: this.callSessionId, candidateSessionId: candidate.sessionId })).catch((error) => this.reportPeerError(error, state.remoteUid));
    }).catch((error) => this.reportPeerError(error, state.remoteUid));
    return state.signaling;
  }

  async flushCandidates(state) {
    const candidates = state.pendingCandidates.splice(0);
    await Promise.all(candidates.filter((candidate) => (!candidate.peerKey || candidate.peerKey === state.peerKey) && (!state.remoteSessionId || candidate.sessionId === state.remoteSessionId)).map((candidate) => state.pc.addIceCandidate(candidate.candidate).then(() => console.info("[WebRTC] ICE applied", { localUser: this.localUid, remoteUser: state.remoteUid, peerKey: state.peerKey, callSessionId: this.callSessionId, candidateSessionId: candidate.sessionId })).catch((error) => this.reportPeerError(error, state.remoteUid))));
  }

  handleConnectionState(state) {
    const stateName = state.pc.connectionState;
    this.onPeerState(state.remoteUid, stateName);
    if (stateName === PEER_STATES.CONNECTED) this.logAudioStats(state).catch((error) => this.reportPeerError(error, state.remoteUid));
    if (["failed", "disconnected"].includes(stateName)) this.recover(state);
  }

  async logAudioStats(state) {
    if (typeof state.pc.getStats !== "function") return;
    const stats = await state.pc.getStats();
    const inboundAudio = [];
    const outboundAudio = [];
    stats.forEach((report) => {
      if (report.type === "inbound-rtp" && (report.kind === "audio" || report.mediaType === "audio")) inboundAudio.push({ bytes: report.bytesReceived ?? 0, packets: report.packetsReceived ?? 0 });
      if (report.type === "outbound-rtp" && (report.kind === "audio" || report.mediaType === "audio")) outboundAudio.push({ bytes: report.bytesSent ?? 0, packets: report.packetsSent ?? 0 });
    });
    console.info("[VOICE DEBUG] AUDIO PEER STATS", { remoteUid: state.remoteUid, inboundAudio, outboundAudio, connectionState: state.pc.connectionState, iceConnectionState: state.pc.iceConnectionState });
  }

  recover(state) {
    if (state.closed || state.recoveryTimer) return;
    state.recoveryTimer = setTimeout(async () => { state.recoveryTimer = null; if (!state.closed && this.peers.get(state.remoteUid) === state) await this.negotiate(state, true); }, ICE_RESTART_DELAY);
  }

  syncParticipants(participants) {
    this.participantSessions = new Map(participants.filter((participant) => participant.uid !== this.localUid).map((participant) => [participant.uid, participant.callSessionId]));
    const remoteIds = new Set(participants.filter((participant) => participant.uid !== this.localUid).map((participant) => participant.uid));
    participants.filter((participant) => participant.uid !== this.localUid).forEach((participant) => {
      const current = this.peers.get(participant.uid);
      if (current && current.participantSessionId && current.participantSessionId !== participant.callSessionId) this.removePeer(participant.uid);
      this.ensurePeer(participant.uid, this.localUid < participant.uid).then((state) => { state.participantSessionId = participant.callSessionId; }).catch(this.onError);
      const queued = this.unknownSignals.get(participant.uid) ?? [];
      this.unknownSignals.delete(participant.uid);
      queued.forEach((signal) => (signal.candidate ? this.handleCandidate(signal) : this.handleSignal(signal)).catch(this.onError));
    });
    [...this.peers.keys()].filter((uid) => !remoteIds.has(uid)).forEach((uid) => this.removePeer(uid));
  }

  replaceTrack(kind, track) {
    return Promise.all([...this.peers.values()].map(async (state) => {
      const transceiver = kind === "audio" ? state.transceivers.audio : kind === "camera" ? state.transceivers.camera : kind === "screen" ? state.transceivers.screen : state.transceivers.screenAudio;
      await transceiver.sender.replaceTrack(track);
      await this.negotiate(state);
    }));
  }

  removePeer(remoteUid) {
    const state = this.peers.get(remoteUid);
    if (!state) return;
    state.closed = true;
    if (state.recoveryTimer) clearTimeout(state.recoveryTimer);
    state.pc.ontrack = null;
    state.pc.onicecandidate = null;
    state.pc.close();
    this.peers.delete(remoteUid);
    this.onRemoteStream(remoteUid, null);
  }

  close() { [...this.peers.keys()].forEach((uid) => this.removePeer(uid)); this.unknownSignals.clear(); }
}
