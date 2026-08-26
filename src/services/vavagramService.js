import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export function subscribeToVavagramPosts(onChange, onError) {
  return onSnapshot(
    query(collection(db, "vavagramPosts"), orderBy("createdAt", "desc")),
    (snapshot) => onChange(snapshot.docs.map((post) => ({ id: post.id, ...post.data() }))),
    onError,
  );
}

export function subscribeToVavagramStories(onChange, onError) {
  return onSnapshot(collection(db, "vavagramStories"), (snapshot) => {
    const now = Date.now();
    onChange(snapshot.docs.map((story) => ({ id: story.id, ...story.data() })).filter((story) => !story.expiresAt || story.expiresAt > now));
  }, onError);
}

const acceptedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const acceptedVideoTypes = ["video/mp4", "video/webm", "video/quicktime"];

export function validateVavagramFile(file, kind) {
  const acceptedTypes = kind === "video" ? acceptedVideoTypes : acceptedImageTypes;
  const maxSize = kind === "video" ? 500 * 1024 * 1024 : 20 * 1024 * 1024;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const acceptedExtensions = kind === "video" ? ["mp4", "webm", "mov"] : ["jpg", "jpeg", "png", "webp"];
  if (!acceptedTypes.includes(file.type) || !acceptedExtensions.includes(extension)) throw new Error("Formato de arquivo não suportado.");
  if (file.size > maxSize) throw new Error(`${kind === "video" ? "O vídeo" : "A foto"} é muito grande. Tamanho máximo: ${kind === "video" ? "500 MB" : "20 MB"}.`);
}

export function uploadVavagramFile(file, path, onProgress, signal) {
  void file; void path; void onProgress; void signal;
  return Promise.reject(new Error("Upload de mídia não está disponível. Use uma URL externa."));
}

export async function createVavagramPost({ files, caption, visibility, author, signal, onProgress }) {
  const postRef = doc(collection(db, "vavagramPosts"));
  const media = [];
  for (const [index, file] of files.entries()) {
    if (signal?.aborted) throw new DOMException("Upload cancelado", "AbortError");
    const kind = file.type.startsWith("video/") ? "video" : "image";
    validateVavagramFile(file, kind);
    const url = await uploadVavagramFile(file, `vavagram/posts/${author.uid}/${postRef.id}/${file.name}`, (progress) => onProgress?.((index + progress / 100) / files.length * 100), signal);
    media.push({ url, type: kind, name: file.name, size: file.size, contentType: file.type });
  }
  await setDoc(postRef, { authorId: author.uid, displayName: author.displayName ?? "Usuário", username: author.username ?? "", type: media.length > 1 ? "carousel" : media[0]?.type ?? "text", media, mediaUrl: media[0]?.url ?? "", mediaType: media[0]?.type ?? "", caption: caption.trim(), visibility, likeCount: 0, commentCount: 0, createdAt: serverTimestamp() });
  return postRef.id;
}

export async function createVavagramStory({ file, caption, author, signal, onProgress }) {
  const storyRef = doc(collection(db, "vavagramStories"));
  const kind = file.type.startsWith("video/") ? "video" : "image";
  validateVavagramFile(file, kind);
  const mediaUrl = await uploadVavagramFile(file, `vavagram/stories/${author.uid}/${storyRef.id}/${file.name}`, onProgress, signal);
  await setDoc(storyRef, { authorId: author.uid, displayName: author.displayName ?? "Usuário", mediaUrl, mediaType: kind, caption: caption.trim(), createdAt: serverTimestamp(), expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  return storyRef.id;
}