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

if (missingEnvironmentVariables.length > 0) {
  throw new Error(
    `Variáveis Firebase ausentes: ${missingEnvironmentVariables.join(", ")}`,
  );
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
};

if (import.meta.env.PROD && firebaseConfig.projectId !== "vava-post") {
  throw new Error("Projeto Firebase de produção inválido.");
}

export const app = getApps()[0] ?? initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

export function firebaseHealthCheck() {
  return { initialized: Boolean(app), authAvailable: Boolean(auth), firestoreAvailable: Boolean(db), projectId: app.options.projectId, expectedProjectId: "vava-post", configuredCorrectly: app.options.projectId === "vava-post" };
}