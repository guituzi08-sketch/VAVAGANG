import assert from "node:assert/strict";
import test from "node:test";

class FakeMediaStream {
  constructor(tracks = []) { this.tracks = tracks; }
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter((track) => track.kind === "audio"); }
  getVideoTracks() { return this.tracks.filter((track) => track.kind === "video"); }
  addTrack(track) { this.tracks.push(track); }
  removeTrack(track) { this.tracks = this.tracks.filter((item) => item !== track); }
}

class FakePeerConnection {
  constructor() { this.connectionState = "new"; this.signalingState = "stable"; this.iceConnectionState = "new"; this.senders = []; }
  addTransceiver() { const sender = { replaceTrack: async (track) => { sender.track = track; } }; this.senders.push(sender); return { sender, receiver: { track: null } }; }
  getSenders() { return this.senders; }
  close() { this.connectionState = "closed"; }
}

globalThis.MediaStream = FakeMediaStream;
globalThis.RTCPeerConnection = FakePeerConnection;

test("criação concorrente retorna um único peer por participante", async () => {
  const { PeerConnectionManager } = await import("./peerConnectionManager.js");
  const localStream = new FakeMediaStream([{ kind: "audio", id: "microphone" }]);
  const manager = new PeerConnectionManager({ db: {}, roomId: "room", localUid: "a", callSessionId: "call", localStream, onRemoteStream() {}, onPeerState() {}, onError() {} });
  const [first, second] = await Promise.all([manager.ensurePeer("b"), manager.ensurePeer("b")]);
  assert.strictEqual(first, second);
  assert.equal(manager.peers.size, 1);
  manager.close();
  assert.equal(first.pc.connectionState, "closed");
});

test("ICE recebido antes da descrição remota fica pendente no peer correto", async () => {
  const { PeerConnectionManager } = await import("./peerConnectionManager.js");
  const manager = new PeerConnectionManager({ db: {}, roomId: "room", localUid: "a", callSessionId: "call", localStream: new FakeMediaStream([{ kind: "audio" }]), onRemoteStream() {}, onPeerState() {}, onError() {} });
  await manager.handleCandidate({ id: "candidate-1", from: "b", to: "a", callSessionId: "call", sessionId: "peer-session", candidate: { candidate: "candidate" } });
  assert.equal(manager.peers.get("b").pendingCandidates.length, 1);
  assert.equal(manager.peers.get("b").pendingCandidates[0].sessionId, "peer-session");
  manager.close();
});

test("mesh de oito participantes cria sete peers e remove apenas quem saiu", async () => {
  const { PeerConnectionManager } = await import("./peerConnectionManager.js");
  const manager = new PeerConnectionManager({ db: {}, roomId: "room", localUid: "a", callSessionId: "call", localStream: new FakeMediaStream([{ kind: "audio" }]), onRemoteStream() {}, onPeerState() {}, onError() {} });
  manager.syncParticipants(["a", "b", "c", "d", "e", "f", "g", "h"].map((uid) => ({ uid, callSessionId: `${uid}-session` })));
  await Promise.all([...manager.creationLocks.values()]);
  assert.equal(manager.peers.size, 7);
  const peerB = manager.peers.get("b");
  manager.syncParticipants(["a", "b", "c", "d", "e", "f", "g"].map((uid) => ({ uid, callSessionId: `${uid}-session` })));
  assert.equal(manager.peers.size, 6);
  assert.equal(manager.peers.has("b"), true);
  assert.equal(peerB.pc.connectionState, "new");
  manager.close();
});

test("ignora sinal de sessão remota antiga", async () => {
  const { PeerConnectionManager } = await import("./peerConnectionManager.js");
  const manager = new PeerConnectionManager({ db: {}, roomId: "room", localUid: "a", callSessionId: "call", localStream: new FakeMediaStream([{ kind: "audio" }]), onRemoteStream() {}, onPeerState() {}, onError() {} });
  manager.syncParticipants([{ uid: "b", callSessionId: "new-session" }]);
  await Promise.all([...manager.creationLocks.values()]);
  const peer = manager.peers.get("b");
  await manager.handleCandidate({ id: "old-candidate", from: "b", to: "a", callSessionId: "old-session", sessionId: "old-peer", candidate: {} });
  assert.equal(peer.pendingCandidates.length, 0);
  assert.equal(peer.pc.getSenders().length, 4);
  manager.close();
});
