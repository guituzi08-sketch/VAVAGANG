import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export async function createRoom(name, user) {
  const roomRef = await addDoc(collection(db, "rooms"), {
    name: name.trim(),
    createdBy: user.uid,
    createdByName: user.displayName ?? user.email ?? "Jogador",
    createdAt: serverTimestamp(),
    participantCount: 0,
  });
  return roomRef.id;
}

export function subscribeToRooms(onChange, onError) {
  return onSnapshot(
    query(collection(db, "rooms"), orderBy("createdAt", "desc")),
    (snapshot) =>
      onChange(snapshot.docs.map((room) => ({ id: room.id, ...room.data() }))),
    onError,
  );
}

export function subscribeToParticipants(roomId, onChange, onError) {
  return onSnapshot(
    collection(db, "rooms", roomId, "participants"),
    (snapshot) =>
      onChange(snapshot.docs.map((participant) => participant.data())),
    onError,
  );
}

export async function joinRoom(roomId, user) {
  await runTransaction(db, async (transaction) => {
    const participantRef = doc(db, "rooms", roomId, "participants", user.uid);
    const roomRef = doc(db, "rooms", roomId);
    const participantSnapshot = await transaction.get(participantRef);
    if (participantSnapshot.exists()) return;
    transaction.set(participantRef, {
      uid: user.uid,
      displayName: user.displayName ?? user.email ?? "Jogador",
      photoURL: user.photoURL ?? "",
      joinedAt: serverTimestamp(),
    });
    transaction.update(roomRef, { participantCount: increment(1) });
  });
}

export async function leaveRoom(roomId, uid) {
  await runTransaction(db, async (transaction) => {
    const participantRef = doc(db, "rooms", roomId, "participants", uid);
    const roomRef = doc(db, "rooms", roomId);
    const participantSnapshot = await transaction.get(participantRef);
    if (!participantSnapshot.exists()) return;
    transaction.delete(participantRef);
    transaction.update(roomRef, { participantCount: increment(-1) });
  });
}

export function subscribeToMomentReactions(roomId, onChange, onError) {
  return onSnapshot(collection(db, "rooms", roomId, "reactions"), (snapshot) => {
    const now = Date.now();
    onChange(snapshot.docs.map((reaction) => ({ id: reaction.id, ...reaction.data() })).filter((reaction) => !reaction.expiresAt || reaction.expiresAt > now));
  }, onError);
}

export async function addMomentReaction(roomId, uid, emoji) {
  const reactionRef = await addDoc(collection(db, "rooms", roomId, "reactions"), { uid, emoji, createdAt: Date.now(), expiresAt: Date.now() + 8000 });
  window.setTimeout(() => deleteDoc(reactionRef).catch(() => {}), 8000);
}