import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";

export function subscribeToVavagramPosts(onChange, onError) {
  return onSnapshot(
    query(collection(db, "vavagramPosts"), orderBy("createdAt", "desc")),
    (snapshot) => onChange(snapshot.docs.map((post) => ({ id: post.id, ...post.data() }))),
    onError,
  );
}