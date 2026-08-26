import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, updateDoc, doc, where } from "firebase/firestore";
import { db } from "../firebase";

export function subscribeToNotifications(uid, onChange, onError) {
  return onSnapshot(query(collection(db, "notifications"), where("recipientId", "==", uid), orderBy("createdAt", "desc")), (snapshot) => {
    onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }, onError);
}

export async function createNotification({ recipientId, senderId = null, type, title, message, metadata = {} }) {
  if (!recipientId) return;
  await addDoc(collection(db, "notifications"), { recipientId, senderId, type, title, message, metadata, read: false, createdAt: serverTimestamp() });
}

export async function markNotificationRead(notificationId) {
  await updateDoc(doc(db, "notifications", notificationId), { read: true });
}

export async function markAllNotificationsRead(notifications) {
  await Promise.all(notifications.filter((notification) => !notification.read).map((notification) => markNotificationRead(notification.id)));
}
