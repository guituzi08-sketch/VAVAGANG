import { addDoc, collection, onSnapshot, query, where, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { isBlocked } from "./friendService";
import { createNotification } from "./notificationService";

export function conversationId(firstUid, secondUid) {
  if (!firstUid || !secondUid || firstUid === secondUid) throw new Error("Não foi possível identificar os participantes desta conversa.");
  return [firstUid, secondUid].sort().join("_");
}

export function subscribeToDirectMessages(userId, contactId, onChange, onError) {
  const currentConversationId = conversationId(userId, contactId);
  const messagesBySource = { sent: new Map(), received: new Map() };
  const publish = () => onChange([...messagesBySource.sent.values(), ...messagesBySource.received.values()]
    .filter((message) => message.conversationId === currentConversationId)
    .sort((first, second) => timestampValue(first.createdAt) - timestampValue(second.createdAt)));
  const unsubscribeSent = onSnapshot(query(collection(db, "directMessages"), where("senderId", "==", userId)), (snapshot) => {
    messagesBySource.sent.clear();
    snapshot.docs.forEach((message) => messagesBySource.sent.set(message.id, { id: message.id, ...message.data() }));
    publish();
  }, onError);
  const unsubscribeReceived = onSnapshot(query(collection(db, "directMessages"), where("recipientId", "==", userId)), (snapshot) => {
    messagesBySource.received.clear();
    snapshot.docs.forEach((message) => messagesBySource.received.set(message.id, { id: message.id, ...message.data() }));
    publish();
  }, onError);
  return () => { unsubscribeSent(); unsubscribeReceived(); };
}

export function subscribeToUnreadDirectMessages(userId, onChange, onError) {
  return onSnapshot(query(collection(db, "directMessages"), where("recipientId", "==", userId)), (snapshot) => {
    onChange(snapshot.docs.filter((message) => message.data().read === false).length);
  }, onError);
}

export async function sendDirectMessage(sender, recipient, text) {
  if (!sender?.uid) throw new Error("Sua sessão não está pronta para enviar mensagens.");
  if (!recipient?.uid || recipient.uid === sender.uid) throw new Error("Selecione um destinatário válido.");
  const cleanText = typeof text === "string" ? text.trim() : "";
  if (!cleanText) return;
  if (await isBlocked(sender.uid, recipient.uid)) throw new Error("Esta interação está bloqueada.");
  const currentConversationId = conversationId(sender.uid, recipient.uid);
  await addDoc(collection(db, "directMessages"), {
    conversationId: currentConversationId,
    senderId: sender.uid,
    senderName: sender.nickname || sender.displayName || sender.email || "Jogador",
    recipientId: recipient.uid,
    recipientName: recipient.displayName ?? "Jogador",
    text: cleanText,
    read: false,
    createdAt: serverTimestamp(),
  });
  try {
    await createNotification({ recipientId: recipient.uid, senderId: sender.uid, type: "direct_message", title: "Nova mensagem privada", message: `${sender.nickname || sender.displayName || "Usuário"} enviou uma mensagem.`, metadata: { conversationId: currentConversationId } });
  } catch (notificationError) {
    console.error("[DirectMessage] mensagem salva, mas a notificação falhou", notificationError);
  }
}

export async function markDirectMessageRead(messageId) {
  await updateDoc(doc(db, "directMessages", messageId), { read: true });
}

function timestampValue(timestamp) {
  return typeof timestamp?.toMillis === "function" ? timestamp.toMillis() : 0;
}
