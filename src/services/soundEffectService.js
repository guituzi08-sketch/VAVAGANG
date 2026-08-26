import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { supabase } from "../supabase";

const BUCKET = "sound-effects";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function getSafeFileName(fileName) {
  return fileName.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
}

export function subscribeToSoundEffects(roomId, onChange, onError) {
  return onSnapshot(
    query(collection(db, "rooms", roomId, "soundEffects"), orderBy("createdAt", "desc")),
    (snapshot) => onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
}

export function subscribeToSoundEffectEvents(roomId, onChange, onError) {
  let initialized = false;
  return onSnapshot(
    query(collection(db, "rooms", roomId, "soundEffectEvents"), orderBy("triggeredAt", "asc")),
    (snapshot) => {
      if (!initialized) {
        initialized = true;
        return;
      }
      onChange(snapshot.docChanges().filter((change) => change.type === "added").map((change) => ({ id: change.doc.id, ...change.doc.data() })));
    },
    onError,
  );
}

export async function uploadSoundEffect(roomId, user, file, name) {
  if (!file || !["audio/mpeg", "audio/wav", "audio/wave", "audio/x-wav"].includes(file.type)) {
    throw new Error("Escolha um arquivo MP3 ou WAV.");
  }
  if (file.size > MAX_FILE_SIZE) throw new Error("O efeito deve ter no máximo 10 MB.");
  const storagePath = `${roomId}/${user.uid}/${crypto.randomUUID()}-${getSafeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  try {
    const effect = await addDoc(collection(db, "rooms", roomId, "soundEffects"), {
      name: name.trim() || file.name.replace(/\.[^/.]+$/, ""),
      storagePath,
      publicUrl: data.publicUrl,
      mimeType: file.type,
      size: file.size,
      createdBy: user.uid,
      createdAt: serverTimestamp(),
    });
    return effect.id;
  } catch (error) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw error;
  }
}

export async function triggerSoundEffect(roomId, user, effectId) {
  await addDoc(collection(db, "rooms", roomId, "soundEffectEvents"), {
    effectId,
    triggeredBy: user.uid,
    triggeredAt: serverTimestamp(),
  });
}

export async function removeSoundEffect(roomId, effect) {
  await deleteDoc(doc(db, "rooms", roomId, "soundEffects", effect.id));
  const { error } = await supabase.storage.from(BUCKET).remove([effect.storagePath]);
  if (error) throw error;
}