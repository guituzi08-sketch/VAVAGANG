import { sendCandidate, sendSignal } from "./signalingService.js";
import { PEER_STATES } from "./voiceState.js";

const ICE_RESTART_DELAY = 1500;

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
    const state = { remoteUid, pc, polite: this.localUid > remoteUid, makingOffer: false, ignoreOffer: false, remoteDescriptionSet: false, pendingCandidates: [], processedCandidates: new Set(), negotiation: Promise.resolve(), localSessionId: crypto.randomUUID(), remoteAudioStream: new MediaStream(), remoteCameraStream: new MediaStream(), remoteScreenStream: new MediaStream(), closed: false };
    this.peers.set(remoteUid, state);
    const audio = pc.addTransceiver("audio", { direction: "sendrecv" });
    const camera = pc.addTransceiver("video", { direction: "sendrecv" });
    const screen = pc.addTransceiver("video", { direction: "sendrecv" });
    const screenAudio = pc.addTransceiver("audio", { direction: "sendrecv" });
    state.transceivers = { audio, camera, screen, screenAudio };
    await audio.sender.replaceTrack(this.localStream.getAudioTracks()[0] ?? null);
    pc.ontrack = (event) => this.handleTrack(state, event);
    pc.onicecandidate = ({ candidate }) => candidate && sendCandidate(this.db, this.roomId, { from: this.localUid, to: remoteUid, callSessionId: this.callSessionId, sessionId: state.localSessionId, candidate: candidate.toJSON() }).catch(this.onError);
    pc.onconnectionstatechange = () => this.handleConnectionState(state);
    pc.oniceconnectionstatechange = () => { if (["failed", "disconnected"].includes(pc.iceConnectionState)) this.recover(state); };
    if (shouldOffer) await this.negotiate(state);
    return state;
  }

  handleTrack(state, event) {
    const { audio, camera, screen, screenAudio } = state.transceivers;
    const target = event.transceiver === camera ? state.remoteCameraStream : event.transceiver === screen || event.transceiver === screenAudio ? state.remoteScreenStream : state.remoteAudioStream;
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
        await sendSignal(this.db, this.roomId, { from: this.localUid, to: state.remoteUid, type: "offer", callSessionId: this.callSessionId, sessionId: state.localSessionId, sdp: offer.sdp });
      } finally { state.makingOffer = false; }
    }).catch(this.onError);
    return state.negotiation;
  }

  async handleSignal(signal) {
    if (signal.from === this.localUid || (this.participantSessions.has(signal.from) && this.participantSessions.get(signal.from) !== signal.callSessionId)) return;
    const state = await this.ensurePeer(signal.from);
    if (signal.type === "offer") await this.handleOffer(state, signal);
    if (signal.type === "answer") await this.handleAnswer(state, signal);
  }

  async handleOffer(state, signal) {
    const collision = state.makingOffer || state.pc.signalingState !== "stable";
    state.ignoreOffer = !state.polite && collision;
    if (state.ignoreOffer) return;
    if (collision) await state.pc.setLocalDescription({ type: "rollback" });
    await state.pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
    state.remoteDescriptionSet = true;
    state.remoteSessionId = signal.sessionId;
    await this.flushCandidates(state);
    const answer = await state.pc.createAnswer();
    await state.pc.setLocalDescription(answer);
    await sendSignal(this.db, this.roomId, { from: this.localUid, to: state.remoteUid, type: "answer", callSessionId: this.callSessionId, sessionId: state.localSessionId, offerSessionId: signal.sessionId, sdp: answer.sdp });
  }

  async handleAnswer(state, signal) {
    if (signal.offerSessionId !== state.localSessionId || state.pc.signalingState !== "have-local-offer") return;
    await state.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
    state.remoteDescriptionSet = true;
    state.remoteSessionId = signal.sessionId;
    await this.flushCandidates(state);
  }

  async handleCandidate(candidate) {
    if (candidate.from === this.localUid || (this.participantSessions.has(candidate.from) && this.participantSessions.get(candidate.from) !== candidate.callSessionId)) return;
    const state = await this.ensurePeer(candidate.from);
    if (state.processedCandidates.has(candidate.id)) return;
    state.processedCandidates.add(candidate.id);
    if (!state.remoteDescriptionSet) state.pendingCandidates.push(candidate);
    else await state.pc.addIceCandidate(candidate.candidate).catch(this.onError);
  }

  async flushCandidates(state) {
    const candidates = state.pendingCandidates.splice(0);
    await Promise.all(candidates.filter((candidate) => !state.remoteSessionId || candidate.sessionId === state.remoteSessionId).map((candidate) => state.pc.addIceCandidate(candidate.candidate).catch(this.onError)));
  }

  handleConnectionState(state) {
    const stateName = state.pc.connectionState;
    this.onPeerState(state.remoteUid, stateName);
    if (["failed", "disconnected"].includes(stateName)) this.recover(state);
  }

  recover(state) {
    if (state.closed || state.recoveryTimer) return;
    state.recoveryTimer = setTimeout(async () => { state.recoveryTimer = null; if (!state.closed && this.peers.get(state.remoteUid) === state) await this.negotiate(state, true); }, ICE_RESTART_DELAY);
  }

  syncParticipants(participants) {
    this.participantSessions = new Map(participants.filter((participant) => participant.uid !== this.localUid).map((participant) => [participant.uid, participant.callSessionId]));
    const remoteIds = new Set(participants.filter((participant) => participant.uid !== this.localUid).map((participant) => participant.uid));
    participants.filter((participant) => participant.uid !== this.localUid).forEach((participant) => this.ensurePeer(participant.uid, this.localUid < participant.uid).catch(this.onError));
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

  close() { [...this.peers.keys()].forEach((uid) => this.removePeer(uid)); }
}
