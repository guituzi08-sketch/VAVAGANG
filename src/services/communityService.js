import {
  addDoc,
  arrayUnion,
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { createNotification } from "./notificationService";

export function subscribeToGroups(uid, onChange, onError) {
  const groupsById = new Map();
  const emit = () => onChange([...groupsById.values()].sort((first, second) => (second.createdAt?.seconds ?? 0) - (first.createdAt?.seconds ?? 0)));
  const subscribe = (groupsQuery) => onSnapshot(groupsQuery, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "removed") groupsById.delete(change.doc.id);
      else groupsById.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
    });
    emit();
  }, onError);
  const unsubscribePublic = subscribe(query(collection(db, "groups"), where("privacy", "==", "public")));
  const unsubscribePrivate = subscribe(query(collection(db, "groups"), where("memberIds", "array-contains", uid)));
  return () => { unsubscribePublic(); unsubscribePrivate(); };
}

export function subscribeToGroupChannels(groupId, onChange, onError) {
  return onSnapshot(query(collection(db, "groups", groupId, "channels"), orderBy("createdAt", "asc")), (snapshot) => {
    onChange(snapshot.docs.map((channel) => ({ id: channel.id, ...channel.data(), messages: [] })));
  }, onError);
}

export function subscribeToChannelMessages(groupId, channelId, onChange, onError) {
  return onSnapshot(query(collection(db, "groups", groupId, "channels", channelId, "messages"), orderBy("createdAt", "asc")), (snapshot) => {
    onChange(snapshot.docs.map((message) => ({ id: message.id, ...message.data() })));
  }, onError);
}

export async function createGroup({ name, description, privacy }, uid) {
  const groupRef = await addDoc(collection(db, "groups"), {
    name: name.trim(),
    description: description.trim(),
    privacy,
    ownerId: uid,
    memberIds: [uid],
    roles: { [uid]: "OWNER" },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await addDoc(collection(db, "groups", groupRef.id, "channels"), {
    name: "geral",
    type: "TEXT",
    category: "INFORMAÇÕES",
    createdAt: serverTimestamp(),
  });
  return groupRef.id;
}

export async function updateGroup(groupId, changes) {
  await updateDoc(doc(db, "groups", groupId), { ...changes, updatedAt: serverTimestamp() });
}

export async function deleteGroup(groupId) {
  await deleteDoc(doc(db, "groups", groupId));
}

export async function createChannel(groupId, { name, type, category }) {
  const channelRef = await addDoc(collection(db, "groups", groupId, "channels"), {
    name: name.trim(),
    type,
    category: category.trim() || (type === "VOICE" ? "VOZ" : "SOCIAL"),
    createdAt: serverTimestamp(),
  });
  return channelRef.id;
}

export async function deleteChannel(groupId, channelId) {
  await deleteDoc(doc(db, "groups", groupId, "channels", channelId));
}

export async function sendChannelMessage(groupId, channelId, user, text) {
  const cleanText = text.trim();
  if (!cleanText) return;
  await addDoc(collection(db, "groups", groupId, "channels", channelId, "messages"), {
    authorId: user.uid,
    authorName: user.nickname || user.displayName || "Usuário",
    text: cleanText,
    createdAt: serverTimestamp(),
    edited: false,
  });
}

export async function editChannelMessage(groupId, channelId, messageId, text) {
  await updateDoc(doc(db, "groups", groupId, "channels", channelId, "messages", messageId), { text: text.trim(), edited: true });
}

export async function deleteChannelMessage(groupId, channelId, messageId) {
  await deleteDoc(doc(db, "groups", groupId, "channels", channelId, "messages", messageId));
}

export async function addMemberToGroup(groupId, uid) {
  await updateDoc(doc(db, "groups", groupId), { memberIds: arrayUnion(uid) });
}

export async function removeMemberFromGroup(groupId, uid) {
  await updateDoc(doc(db, "groups", groupId), { memberIds: arrayRemove(uid), [`roles.${uid}`]: null });
}

export async function changeMemberRole(groupId, uid, role) {
  if (!["OWNER", "ADMIN", "MODERATOR", "MEMBER"].includes(role)) throw new Error("Cargo inválido.");
  await updateDoc(doc(db, "groups", groupId), { [`roles.${uid}`]: role });
}

export function subscribeToGroupInvites(uid, onChange, onError) {
  return onSnapshot(query(collection(db, "groupInvites"), where("recipientId", "==", uid), where("status", "==", "pending")), (snapshot) => onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), onError);
}

export async function inviteToGroup(groupId, sender, recipient) {
  const invites = collection(db, "groupInvites");
  const existing = await getDocs(query(invites, where("groupId", "==", groupId), where("recipientId", "==", recipient.uid), where("status", "==", "pending")));
  if (!existing.empty) return false;
  const invite = await addDoc(invites, { groupId, senderId: sender.uid, recipientId: recipient.uid, senderName: sender.nickname || sender.displayName || "Usuário", status: "pending", createdAt: serverTimestamp() });
  await createNotification({ recipientId: recipient.uid, senderId: sender.uid, type: "group_invite", title: "Convite para grupo", message: `${sender.nickname || sender.displayName || "Usuário"} convidou você para um grupo.`, metadata: { groupId, inviteId: invite.id } });
  return invite.id;
}

export async function respondToGroupInvite(invite, accepted) {
  await updateDoc(doc(db, "groupInvites", invite.id), { status: accepted ? "accepted" : "declined", respondedAt: serverTimestamp() });
  if (accepted) await addMemberToGroup(invite.groupId, invite.recipientId);
}
