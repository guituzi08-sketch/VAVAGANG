import { collection, doc, getDocs, getDoc, limit, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../firebase";

export async function syncUserProfile(firebaseUser) {
  const userRef = doc(db, "users", firebaseUser.uid);
  const snapshot = await getDoc(userRef);
  const profile = {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? "",
    displayName: firebaseUser.displayName ?? "Jogador",
    displayNameNormalized: (firebaseUser.displayName ?? "Jogador").trim().toLowerCase(),
    nickname: snapshot.exists() ? snapshot.data().nickname ?? "" : "",
    nicknameNormalized: snapshot.exists() ? snapshot.data().nicknameNormalized ?? normalizeUserSearch(snapshot.data().nickname ?? "") : "",
    photoURL: firebaseUser.photoURL ?? "",
    username: snapshot.exists() ? snapshot.data().username ?? "" : "",
    usernameNormalized: snapshot.exists() ? snapshot.data().usernameNormalized ?? normalizeUserSearch(snapshot.data().username ?? "") : "",
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
  const changes = { ...profileChanges, updatedAt: serverTimestamp() };
  if (typeof changes.nickname === "string") {
    const nickname = changes.nickname.trim();
    if (!nickname || !/^[a-zA-Z0-9_.]{3,24}$/.test(nickname)) throw new Error("Use um nickname com 3 a 24 caracteres: letras, números, ponto ou _. ");
    const nicknameNormalized = normalizeUserSearch(nickname);
    const existing = await getDocs(query(collection(db, "users"), where("nicknameNormalized", "==", nicknameNormalized), limit(2)));
    if (existing.docs.some((snapshot) => snapshot.id !== uid)) throw new Error("Este nickname já está em uso.");
    changes.nickname = nickname;
    changes.nicknameNormalized = nicknameNormalized;
  }
  if (typeof changes.username === "string") {
    const username = changes.username.trim().replace(/^@/, "").toLowerCase();
    if (username && !/^[a-z0-9_\.]{3,24}$/.test(username)) throw new Error("Use um username com 3 a 24 caracteres: letras, números, ponto ou _. ");
    changes.username = username;
    changes.usernameNormalized = username;
    if (username) {
      const existing = await getDocs(query(collection(db, "users"), where("usernameNormalized", "==", username), limit(2)));
      if (existing.docs.some((snapshot) => snapshot.id !== uid)) throw new Error("Este username já está em uso.");
    }
  }
  await setDoc(userRef, changes, { merge: true });
  const snapshot = await getDoc(userRef);
  return snapshot.data();
}

export function normalizeUserSearch(value) {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export async function searchUsers(searchValue) {
  const normalized = normalizeUserSearch(searchValue);
  if (!normalized) return [];
  const usersRef = collection(db, "users");
  const prefixEnd = `${normalized}\uf8ff`;
  const [usernameSnapshot, displayNameSnapshot] = await Promise.all([
    getDocs(query(usersRef, where("usernameNormalized", ">=", normalized), where("usernameNormalized", "<=", prefixEnd), limit(20))),
    getDocs(query(usersRef, where("displayNameNormalized", ">=", normalized), where("displayNameNormalized", "<=", prefixEnd), limit(20))),
  ]);
  const nicknameSnapshot = await getDocs(query(usersRef, where("nicknameNormalized", ">=", normalized), where("nicknameNormalized", "<=", prefixEnd), limit(20)));
  const users = new Map();
  [...nicknameSnapshot.docs, ...usernameSnapshot.docs, ...displayNameSnapshot.docs].forEach((snapshot) => users.set(snapshot.id, { uid: snapshot.id, ...snapshot.data() }));
  return [...users.values()].filter((user) => user.uid).slice(0, 20);
}

export async function setUserPresence(uid, presenceStatus) {
  await setDoc(doc(db, "users", uid), { presenceStatus, lastSeenAt: serverTimestamp() }, { merge: true });
}