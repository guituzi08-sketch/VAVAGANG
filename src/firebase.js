import { getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const requiredEnvironmentVariables = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

const missingEnvironmentVariables = requiredEnvironmentVariables.filter(
  (variableName) => !import.meta.env[variableName],
);

export const firebaseConfigurationError = missingEnvironmentVariables.length > 0
  ? `Configure as variáveis Firebase ausentes: ${missingEnvironmentVariables.join(", ")}.`
  : "";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
};

if (import.meta.env.PROD && (firebaseConfig.projectId !== "vava-post" || firebaseConfig.authDomain !== "vava-post.firebaseapp.com")) {
  throw new Error("Configuração Firebase de produção inválida.");
}

const existingApp = getApps()[0];
if (existingApp && (existingApp.options.projectId !== "vava-post" || existingApp.options.authDomain !== "vava-post.firebaseapp.com")) {
  throw new Error("Existe uma instância Firebase incompatível.");
}

export const app = existingApp ?? (firebaseConfigurationError ? null : initializeApp(firebaseConfig));
export const auth = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();
export const db = app ? getFirestore(app) : null;

export function firebaseHealthCheck() {
  return { initialized: Boolean(app), authAvailable: Boolean(auth), firestoreAvailable: Boolean(db), projectId: app?.options.projectId ?? null, expectedProjectId: "vava-post", configuredCorrectly: Boolean(app) && app.options.projectId === "vava-post", configurationError: firebaseConfigurationError };
}