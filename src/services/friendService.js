import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { db } from "../firebase";

export async function createFriendRequest(sender, recipient) {
  const requests = collection(db, "friendRequests");
  const existing = await getDocs(query(requests, where("senderId", "==", sender.uid), where("recipientId", "==", recipient.uid), where("status", "==", "pending")));
  if (!existing.empty) return false;
  await addDoc(requests, { senderId: sender.uid, senderName: sender.displayName ?? "Jogador", recipientId: recipient.uid, recipientName: recipient.displayName ?? "Jogador", status: "pending", createdAt: serverTimestamp() });
  return true;
}