import { addDoc, collection, onSnapshot, query, where, orderBy, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { isBlocked } from "./friendService";
import { createNotification } from "./notificationService";

export function conversationId(firstUid, secondUid) {
  if (!firstUid || !secondUid || firstUid === secondUid) throw new Error("Não foi possível identificar os participantes desta conversa.");
  return [firstUid, secondUid].sort().join("_");
}

export function subscribeToDirectMessages(userId, contactId, onChange, onError) {
  return onSnapshot(query(collection(db, "directMessages"), where("conversationId", "==", conversationId(userId, contactId)), orderBy("createdAt", "asc")), (snapshot) => {
    onChange(snapshot.docs.map((message) => ({ id: message.id, ...message.data() })));
  }, onError);
}

export function subscribeToUnreadDirectMessages(userId, onChange, onError) {
  return onSnapshot(query(collection(db, "directMessages"), where("recipientId", "==", userId), where("read", "==", false)), (snapshot) => onChange(snapshot.size), onError);
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
