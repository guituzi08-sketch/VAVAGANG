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
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";

const postsCollection = collection(db, "vavaxPosts");

const directVideoPattern = /\.(mp4|webm|ogg|ogv)(?:$|[?#])/i;

function getYouTubeEmbedUrl(url) {
  const hostname = url.hostname.toLowerCase();
  let videoId = "";
  if (hostname === "youtu.be") videoId = url.pathname.slice(1).split("/")[0];
  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(hostname)) {
    videoId = url.searchParams.get("v") || url.pathname.match(/^\/(?:embed\/|shorts\/|live\/)([^/?]+)/)?.[1] || "";
  }
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return "";
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

function getVimeoEmbedUrl(url) {
  if (!["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(url.hostname.toLowerCase())) return "";
  const videoId = url.pathname.match(/\/(?:video\/)?(\d+)(?:$|\/)/)?.[1];
  return videoId ? `https://player.vimeo.com/video/${videoId}` : "";
}

export function classifyVavaXMedia(mediaUrl) {
  let url;
  try {
    url = new URL(mediaUrl.trim());
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol)) return null;
  const youtubeEmbedUrl = getYouTubeEmbedUrl(url);
  if (youtubeEmbedUrl) return { type: "video", provider: "youtube", embedUrl: youtubeEmbedUrl };
  const vimeoEmbedUrl = getVimeoEmbedUrl(url);
  if (vimeoEmbedUrl) return { type: "video", provider: "vimeo", embedUrl: vimeoEmbedUrl };
  if (directVideoPattern.test(url.pathname + url.search)) return { type: "video", provider: "direct" };
  return { type: "image" };
}

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

export async function createVavaXPost({ author, mediaUrl, mediaType, caption }) {
  const cleanUrl = mediaUrl.trim();
  const media = classifyVavaXMedia(cleanUrl);
  if (!media || (mediaType === "video" && media.type !== "video") || (mediaType === "image" && media.type !== "image")) {
    throw new Error(mediaType === "video" ? "Informe uma URL de vídeo válida do YouTube, Vimeo ou de um arquivo compatível." : "Informe uma URL de imagem válida.");
  }
  const post = await addDoc(postsCollection, {
    authorId: author.uid,
    displayName: author.nickname || author.displayName || "Usuário",
    username: author.username ?? "",
    mediaUrl: cleanUrl,
    mediaType: media.type,
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

export function subscribeToVavaXNotifications(userId, onChange, onError) {
  return onSnapshot(
    query(collection(db, "vavaxNotifications"), where("recipientId", "==", userId)),
    (snapshot) => onChange(snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((first, second) => getTimestamp(second.createdAt) - getTimestamp(first.createdAt))),
    onError,
  );
}

function getTimestamp(value) {
  return value?.toMillis?.() ?? (value?.seconds ? value.seconds * 1000 : 0);
}

export async function markVavaXNotificationRead(notificationId) {
  await updateDoc(doc(db, "vavaxNotifications", notificationId), { read: true });
}

export async function deleteVavaXPost(postId) {
  await deleteDoc(doc(db, "vavaxPosts", postId));
}
