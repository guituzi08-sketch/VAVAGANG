export function getErrorMessage(error, fallback = "Ocorreu um erro inesperado.") {
  if (typeof error === "string" && error.trim()) return error;
  if (typeof error?.message === "string" && error.message.trim()) return error.message;
  return fallback;
}
