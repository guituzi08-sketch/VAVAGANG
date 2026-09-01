import { supabase, supabaseConfigurationError } from "../supabase";

const PROFILE_BUCKET = "profile-images";
const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function requireSupabase() {
  if (!supabase) throw new Error("O armazenamento de imagens não está configurado.");
  if (supabaseConfigurationError) throw new Error("O armazenamento de imagens não está configurado.");
  return supabase;
}

export function validateProfileImage(file) {
  if (!file || !ALLOWED_PROFILE_IMAGE_TYPES.has(file.type)) {
    throw new Error("Escolha uma imagem JPG, PNG ou WEBP.");
  }
  if (file.size > MAX_PROFILE_IMAGE_SIZE) {
    throw new Error("A imagem deve ter no máximo 5 MB.");
  }
}

export async function uploadProfileImage(uid, file) {
  validateProfileImage(file);
  const client = requireSupabase();
  const path = `${uid}/avatar`;
  const { error } = await client.storage.from(PROFILE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error("Não foi possível enviar a foto de perfil.");
  return client.storage.from(PROFILE_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function removeProfileImage(uid) {
  const client = requireSupabase();
  const { error } = await client.storage.from(PROFILE_BUCKET).remove([`${uid}/avatar`]);
  if (error) throw new Error("Não foi possível remover a foto de perfil.");
}
