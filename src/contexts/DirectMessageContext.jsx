import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { markDirectMessageRead, sendDirectMessage, subscribeToDirectMessages, subscribeToUnreadDirectMessages } from "../services/directMessageService";

const DirectMessageContext = createContext(null);

export function DirectMessageProvider({ children }) {
  const { firebaseUser } = useAuth();
  const [contact, setContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!firebaseUser) return undefined;
    return subscribeToUnreadDirectMessages(firebaseUser.uid, setUnreadCount, (snapshotError) => setError(snapshotError.message));
  }, [firebaseUser]);
  useEffect(() => {
    if (!firebaseUser || !contact?.uid) { setMessages([]); return undefined; }
    return subscribeToDirectMessages(firebaseUser.uid, contact.uid, (nextMessages) => {
      setMessages(nextMessages);
      nextMessages.filter((message) => message.recipientId === firebaseUser.uid && !message.read).forEach((message) => markDirectMessageRead(message.id).catch(() => {}));
    }, (snapshotError) => setError(snapshotError.message));
  }, [firebaseUser, contact]);

  async function sendMessage(text) {
    if (!firebaseUser) throw new Error("Sua sessão expirou. Entre novamente para enviar mensagens.");
    if (!contact?.uid) throw new Error("O destinatário desta conversa não está disponível.");
    try {
      await sendDirectMessage(firebaseUser, contact, text);
    } catch (sendError) {
      console.error("[DirectMessage] falha ao enviar mensagem", sendError);
      setError(sendError.message || "Não foi possível enviar a mensagem.");
      throw sendError;
    }
  }

  return <DirectMessageContext.Provider value={{ contact, messages, unreadCount, error, openPrivateChat: setContact, closePrivateChat: () => setContact(null), sendMessage }}>{children}</DirectMessageContext.Provider>;
}

export function useDirectMessages() {
  return useContext(DirectMessageContext);
}
