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

export async function createVavagramPost({ media, caption, visibility, author }) {
  const postRef = doc(collection(db, "vavagramPosts"));
  if (!media?.length || !media.every((item) => /^https?:\/\/\S+$/i.test(item.url))) throw new Error("Informe uma URL externa válida.");
  await setDoc(postRef, { authorId: author.uid, displayName: author.nickname || author.displayName || "Usuário", username: author.username ?? "", type: media[0].type, media, mediaUrl: media[0].url, mediaType: media[0].type, caption: caption.trim(), visibility, likeCount: 0, commentCount: 0, createdAt: serverTimestamp() });
  return postRef.id;
}

export async function createVavagramStory({ file, mediaUrl, mediaType = "image", caption, author }) {
  const storyRef = doc(collection(db, "vavagramStories"));
  if (file || !/^https?:\/\/\S+$/i.test(mediaUrl ?? "")) throw new Error("Stories devem usar uma URL externa válida.");
  await setDoc(storyRef, { authorId: author.uid, displayName: author.nickname || author.displayName || "Usuário", mediaUrl, mediaType, caption: caption.trim(), createdAt: serverTimestamp(), expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  return storyRef.id;
}