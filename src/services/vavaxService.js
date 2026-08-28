import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";

const postsCollection = collection(db, "vavaxPosts");

export function subscribeToVavaXPosts(onChange, onError) {
  return onSnapshot(
    query(postsCollection, orderBy("createdAt", "desc")),
    (snapshot) => onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
}

export function subscribeToVavaXComments(postId, onChange, onError) {
  return onSnapshot(
    query(collection(db, "vavaxComments"), orderBy("createdAt", "asc")),
    (snapshot) => onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((comment) => comment.postId === postId)),
    onError,
  );
}

export async function createVavaXPost({ author, mediaUrl, caption }) {
  const cleanUrl = mediaUrl.trim();
  if (!/^https?:\/\/\S+$/i.test(cleanUrl)) throw new Error("Informe uma URL de imagem válida.");
  const post = await addDoc(postsCollection, {
    authorId: author.uid,
    displayName: author.nickname || author.displayName || "Usuário",
    username: author.username ?? "",
    mediaUrl: cleanUrl,
    caption: caption.trim(),
    likeCount: 0,
    commentCount: 0,
    createdAt: serverTimestamp(),
  });
  return post.id;
}

export async function toggleVavaXLike(post, user) {
  const likeRef = doc(db, "vavaxLikes", `${post.id}_${user.uid}`);
  const postRef = doc(db, "vavaxPosts", post.id);
  let liked = false;
  await runTransaction(db, async (transaction) => {
    const likeSnapshot = await transaction.get(likeRef);
    if (likeSnapshot.exists()) {
      transaction.delete(likeRef);
      transaction.update(postRef, { likeCount: increment(-1) });
      return;
    }
    liked = true;
    transaction.set(likeRef, { postId: post.id, userId: user.uid, createdAt: serverTimestamp() });
    transaction.update(postRef, { likeCount: increment(1) });
  });
  if (liked && post.authorId !== user.uid) await createVavaXNotification(post.authorId, user, "like", { postId: post.id });
  return liked;
}

export async function hasVavaXLike(postId, userId) {
  if (!postId || !userId) return false;
  return (await getDoc(doc(db, "vavaxLikes", `${postId}_${userId}`))).exists();
}

export async function addVavaXComment(post, user, text) {
  const cleanText = text.trim();
  if (!cleanText) return;
  await addDoc(collection(db, "vavaxComments"), {
    postId: post.id,
    authorId: user.uid,
    displayName: user.displayName || user.email || "Usuário",
    text: cleanText,
    createdAt: serverTimestamp(),
  });
  await runTransaction(db, async (transaction) => {
    transaction.update(doc(db, "vavaxPosts", post.id), { commentCount: increment(1) });
  });
  if (post.authorId !== user.uid) await createVavaXNotification(post.authorId, user, "comment", { postId: post.id });
}

export async function toggleVavaXFollow(targetUserId, user) {
  if (targetUserId === user.uid) return false;
  const followRef = doc(db, "vavaxFollows", `${targetUserId}_${user.uid}`);
  const followSnapshot = await getDoc(followRef);
  if (followSnapshot.exists()) {
    await deleteDoc(followRef);
    return false;
  }
  await setDoc(followRef, { followingId: targetUserId, followerId: user.uid, createdAt: serverTimestamp() });
  await createVavaXNotification(targetUserId, user, "follow", { profileId: user.uid });
  return true;
}

export async function isVavaXFollowing(targetUserId, userId) {
  if (!targetUserId || !userId || targetUserId === userId) return false;
  return (await getDoc(doc(db, "vavaxFollows", `${targetUserId}_${userId}`))).exists();
}

export async function createVavaXNotification(recipientId, user, type, metadata) {
  await addDoc(collection(db, "vavaxNotifications"), {
    recipientId,
    senderId: user.uid,
    senderName: user.displayName || user.email || "Usuário",
    type,
    metadata,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function deleteVavaXPost(postId) {
  await deleteDoc(doc(db, "vavaxPosts", postId));
}
