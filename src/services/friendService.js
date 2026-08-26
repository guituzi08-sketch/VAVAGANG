import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import { createNotification } from "./notificationService";

export async function createFriendRequest(sender, recipient) {
  const requests = collection(db, "friendRequests");
  const existing = await getDocs(query(requests, where("senderId", "==", sender.uid), where("recipientId", "==", recipient.uid), where("status", "==", "pending")));
  if (!existing.empty) return false;
  await addDoc(requests, { senderId: sender.uid, senderName: sender.nickname || sender.displayName || "Jogador", recipientId: recipient.uid, recipientName: recipient.nickname || recipient.displayName || "Jogador", status: "pending", createdAt: serverTimestamp() });
  await createNotification({ recipientId: recipient.uid, senderId: sender.uid, type: "friend_request", title: "Nova solicitação de amizade", message: `${sender.nickname || sender.displayName || "Usuário"} quer adicionar você.`, metadata: { senderId: sender.uid } });
  return true;
}

export function subscribeToFriendRequests(uid, onChange, onError) {
  return onSnapshot(query(collection(db, "friendRequests"), where("recipientId", "==", uid), where("status", "==", "pending")), (snapshot) => {
    onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }, onError);
}

export function subscribeToFriends(uid, onChange, onError) {
  let profileUnsubscribers = [];
  const unsubscribeFriendships = onSnapshot(query(collection(db, "friendships"), where("members", "array-contains", uid)), (snapshot) => {
    profileUnsubscribers.forEach((unsubscribe) => unsubscribe());
    profileUnsubscribers = [];
    const friends = snapshot.docs.map((item) => {
      const data = item.data();
      const friendUid = data.members.find((member) => member !== uid);
      return { id: item.id, ...data, uid: friendUid, ...(data.profiles?.[friendUid] ?? {}) };
    });
    onChange(friends);
    friends.forEach((friend) => {
      profileUnsubscribers.push(onSnapshot(doc(db, "users", friend.uid), (profileSnapshot) => {
        const profile = profileSnapshot.data() ?? {};
        onChange(friends.map((item) => item.uid === friend.uid ? { ...item, ...profile, status: profile.presenceStatus ?? "offline" } : item));
      }, onError));
    });
  }, onError);
  return () => { unsubscribeFriendships(); profileUnsubscribers.forEach((unsubscribe) => unsubscribe()); };
}

export async function acceptFriendRequest(request) {
  await updateDoc(doc(db, "friendRequests", request.id), { status: "accepted" });
  const friendshipId = [request.senderId, request.recipientId].sort().join("_");
  await setDoc(doc(db, "friendships", friendshipId), { members: [request.senderId, request.recipientId], profiles: { [request.senderId]: { displayName: request.senderName }, [request.recipientId]: { displayName: request.recipientName } }, createdAt: serverTimestamp() }, { merge: true });
  await createNotification({ recipientId: request.senderId, senderId: request.recipientId, type: "friend_accepted", title: "Amizade aceita", message: `${request.recipientName} aceitou sua solicitação.`, metadata: { friendshipId } });
}

export async function rejectFriendRequest(requestId) {
  await updateDoc(doc(db, "friendRequests", requestId), { status: "rejected" });
}

export async function removeFriend(friendshipId) {
  await deleteDoc(doc(db, "friendships", friendshipId));
}

export function subscribeToBlocks(uid, onChange, onError) {
  return onSnapshot(query(collection(db, "blocks"), where("ownerId", "==", uid)), (snapshot) => {
    onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }, onError);
}

export async function blockUser(uid, blockedUid) {
  await setDoc(doc(db, "blocks", `${uid}_${blockedUid}`), { ownerId: uid, blockedUid, createdAt: serverTimestamp() });
  await removeFriend([uid, blockedUid].sort().join("_"));
}

export async function unblockUser(blockId) {
  await deleteDoc(doc(db, "blocks", blockId));
}

export async function isBlocked(uid, otherUid) {
  const [first, second] = await Promise.all([
    getDocs(query(collection(db, "blocks"), where("ownerId", "==", uid), where("blockedUid", "==", otherUid))),
    getDocs(query(collection(db, "blocks"), where("ownerId", "==", otherUid), where("blockedUid", "==", uid))),
  ]);
  return !first.empty || !second.empty;
}