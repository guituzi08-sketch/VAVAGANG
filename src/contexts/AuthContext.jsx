import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { createContext, useContext, useEffect, useState } from "react";
import { auth, googleProvider } from "../firebase";
import { setUserPresence, syncUserProfile, updateUserProfile } from "../services/userService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    return onAuthStateChanged(
      auth,
      async (user) => {
        setFirebaseUser(user);
        if (!user) {
          setProfile(null);
          setLoading(false);
          return;
        }

        try {
          setProfile(await syncUserProfile(user));
          await setUserPresence(user.uid, "online");
        } catch (profileError) {
          setError(profileError.message);
        } finally {
          setLoading(false);
        }
      },
      (authError) => {
        setError(
          authError.code === "auth/unauthorized-domain"
            ? "Este domínio não está autorizado no Firebase Authentication."
            : authError.message,
        );
        setLoading(false);
      },
    );
  }, []);

  async function loginWithGoogle() {
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (loginError) {
      setError(
        loginError.code === "auth/popup-closed-by-user"
          ? ""
          : loginError.code === "auth/unauthorized-domain"
            ? "Este domínio não está autorizado no Firebase Authentication."
            : loginError.message,
      );
      return null;
    }
  }

  async function loginWithEmail(email, password) {
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (loginError) {
      setError(formatAuthError(loginError));
      return null;
    }
  }

  async function registerWithEmail(email, password) {
    setError("");
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (registerError) {
      setError(formatAuthError(registerError));
      return null;
    }
  }

  async function logout() {
    if (firebaseUser) await setUserPresence(firebaseUser.uid, "offline");
    await signOut(auth);
  }

  async function refreshProfile(profileChanges) {
    if (!firebaseUser) return null;
    const nextProfile = await updateUserProfile(firebaseUser.uid, profileChanges);
    setProfile(nextProfile);
    return nextProfile;
  }

  return (
    <AuthContext.Provider value={{ firebaseUser, profile, loading, error, loginWithGoogle, loginWithEmail, registerWithEmail, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

function formatAuthError(authError) {
  const messages = {
    "auth/invalid-credential": "E-mail ou senha inválidos.",
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/invalid-email": "Informe um e-mail válido.",
  };
  return messages[authError.code] ?? authError.message;
}

export function useAuth() {
  return useContext(AuthContext);
}