import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export async function syncUserProfile(firebaseUser) {
  const userRef = doc(db, "users", firebaseUser.uid);
  const snapshot = await getDoc(userRef);
  const profile = {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? "",
    displayName: firebaseUser.displayName ?? "Jogador",
    photoURL: firebaseUser.photoURL ?? "",
    updatedAt: serverTimestamp(),
  };

  if (!snapshot.exists()) {
    await setDoc(userRef, { ...profile, createdAt: serverTimestamp() });
  } else {
    await setDoc(userRef, profile, { merge: true });
  }

  const savedSnapshot = await getDoc(userRef);
  return savedSnapshot.data();
}

export async function updateUserProfile(uid, profileChanges) {
  const userRef = doc(db, "users", uid);
  await setDoc(userRef, { ...profileChanges, updatedAt: serverTimestamp() }, { merge: true });
  const snapshot = await getDoc(userRef);
  return snapshot.data();
}