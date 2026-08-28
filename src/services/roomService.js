import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";

export async function createRoom(name, user) {
  const roomRef = await addDoc(collection(db, "rooms"), {
    name: name.trim(),
    ownerId: user.uid,
    createdBy: user.uid,
    createdByName: user.displayName ?? user.email ?? "Jogador",
    createdAt: serverTimestamp(),
    participantCount: 0,
  });
  return roomRef.id;
}

export function subscribeToRooms(onChange, onError) {
  const roomsById = new Map();
  const activeCounts = new Map();
  const participantUnsubscribers = new Map();
  const emit = () => onChange([...roomsById.values()].map((room) => ({ ...room, participantCount: activeCounts.get(room.id) ?? 0 })));
  const unsubscribeRooms = onSnapshot(query(collection(db, "rooms"), orderBy("createdAt", "desc")), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const roomId = change.doc.id;
      if (change.type === "removed" || change.doc.data().status === "closed") {
        roomsById.delete(roomId);
        activeCounts.delete(roomId);
        participantUnsubscribers.get(roomId)?.();
        participantUnsubscribers.delete(roomId);
        return;
      }
      roomsById.set(roomId, { id: roomId, ...change.doc.data() });
      if (!participantUnsubscribers.has(roomId)) {
        participantUnsubscribers.set(roomId, subscribeToParticipants(roomId, (participants) => {
          const now = Date.now();
          activeCounts.set(roomId, participants.filter((participant) => {
            const lastSeen = participant.lastSeen?.toMillis?.() ?? participant.lastSeen;
            return typeof lastSeen === "number" && now - lastSeen <= 45_000;
          }).length);
          emit();
        }, onError));
      }
    });
    emit();
  }, onError);
  return () => {
    unsubscribeRooms();
    participantUnsubscribers.forEach((unsubscribe) => unsubscribe());
  };
}

export function subscribeToRoom(roomId, onChange, onError) {
  return onSnapshot(doc(db, "rooms", roomId), (snapshot) => {
    onChange(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
  }, onError);
}

export async function getRoom(roomId) {
  if (!roomId) return null;
  const snapshot = await getDoc(doc(db, "rooms", roomId));
  if (!snapshot.exists() || snapshot.data().status === "closed") return null;
  return { id: snapshot.id, ...snapshot.data() };
}

export async function updateRoom(roomId, updates) {
  const cleanUpdates = {
    name: updates.name.trim(),
    description: updates.description?.trim() ?? "",
  };
  await updateDoc(doc(db, "rooms", roomId), cleanUpdates);
}

export async function deleteRoom(roomId, user) {
  if (!user?.uid) throw new Error("Você precisa estar autenticado para excluir uma sala.");
  const roomRef = doc(db, "rooms", roomId);
  const roomSnapshot = await getDoc(roomRef);
  if (!roomSnapshot.exists()) throw new Error("Esta sala não existe mais.");
  if ((roomSnapshot.data().ownerId ?? roomSnapshot.data().createdBy) !== user.uid) throw new Error("Você não tem permissão para excluir esta sala.");
  await updateDoc(roomRef, { status: "closed", closedAt: serverTimestamp() });

  for (const subcollection of ["participants", "signals", "candidates", "reactions", "messages"]) {
    const snapshot = await getDocs(collection(db, "rooms", roomId, subcollection));
    for (let start = 0; start < snapshot.docs.length; start += 450) {
      const batch = writeBatch(db);
      snapshot.docs.slice(start, start + 450).forEach((item) => batch.delete(item.ref));
      await batch.commit();
    }
  }

  await deleteDoc(roomRef);
}

export function subscribeToParticipants(roomId, onChange, onError) {
  return onSnapshot(
    collection(db, "rooms", roomId, "participants"),
    (snapshot) =>
      onChange(snapshot.docs.map((participant) => participant.data())),
    onError,
  );
}

export async function updateParticipantState(roomId, uid, changes) {
  await updateDoc(doc(db, "rooms", roomId, "participants", uid), changes);
}

export async function refreshParticipantPresence(roomId, uid) {
  await updateParticipantState(roomId, uid, { status: "online", lastSeen: serverTimestamp() });
}

export function subscribeToRoomMessages(roomId, onChange, onError) {
  return onSnapshot(query(collection(db, "rooms", roomId, "messages"), orderBy("createdAt", "asc")), (snapshot) => {
    onChange(snapshot.docs.map((message) => ({ id: message.id, ...message.data() })));
  }, onError);
}

export async function sendRoomMessage(roomId, user, text) {
  const cleanText = text.trim();
  if (!cleanText) return;
  await addDoc(collection(db, "rooms", roomId, "messages"), {
    authorId: user.uid,
    authorName: user.displayName ?? user.email ?? "Jogador",
    text: cleanText,
    createdAt: serverTimestamp(),
  });
}

export async function joinRoom(roomId, user, profile = {}, callSessionId = null) {
  await runTransaction(db, async (transaction) => {
    const participantRef = doc(db, "rooms", roomId, "participants", user.uid);
    const roomRef = doc(db, "rooms", roomId);
    const participantSnapshot = await transaction.get(participantRef);
    const roomSnapshot = await transaction.get(roomRef);
    if (!roomSnapshot.exists() || roomSnapshot.data().status === "closed") throw new Error("Esta sala foi encerrada.");
    const participantData = {
      uid: user.uid,
      displayName: profile.nickname || profile.displayName || user.displayName || user.email || "Jogador",
      photoURL: user.photoURL ?? "",
      status: "online",
      lastSeen: serverTimestamp(),
      muted: false,
      speaking: false,
      cameraEnabled: false,
      screenSharing: false,
      screenAudio: false,
      callSessionId,
      joinedAt: serverTimestamp(),
    };
    if (participantSnapshot.exists()) {
      transaction.update(participantRef, { displayName: participantData.displayName, photoURL: participantData.photoURL, status: "online", lastSeen: serverTimestamp(), cameraEnabled: false, screenSharing: false, screenAudio: false, callSessionId });
      return;
    }
    transaction.set(participantRef, participantData);
    transaction.update(roomRef, { participantCount: increment(1) });
  });
}

export async function leaveRoom(roomId, uid, callSessionId) {
  await runTransaction(db, async (transaction) => {
    const participantRef = doc(db, "rooms", roomId, "participants", uid);
    const roomRef = doc(db, "rooms", roomId);
    const participantSnapshot = await transaction.get(participantRef);
    const roomSnapshot = await transaction.get(roomRef);
    if (!participantSnapshot.exists() || !roomSnapshot.exists() || roomSnapshot.data().status === "closed") return;
    if (callSessionId && participantSnapshot.data().callSessionId !== callSessionId) return;
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