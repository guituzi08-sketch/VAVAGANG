import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { createContext, useContext, useEffect, useState } from "react";
import { auth, firebaseConfigurationError, googleProvider } from "../firebase";
import { setUserPresence, syncUserProfile, updateUserProfile } from "../services/userService";
import { getErrorMessage } from "../utils/errorMessage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auth) {
      setError(firebaseConfigurationError);
      setLoading(false);
      return undefined;
    }
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
          setError(getErrorMessage(profileError, "Não foi possível carregar seu perfil."));
        } finally {
          setLoading(false);
        }
      },
      (authError) => {
        setError(
          authError.code === "auth/unauthorized-domain"
            ? "Este domínio não está autorizado no Firebase Authentication."
            : getErrorMessage(authError, "Não foi possível verificar sua sessão."),
        );
        setLoading(false);
      },
    );
  }, []);

  async function loginWithGoogle() {
    setError("");
    if (!auth) {
      setError(firebaseConfigurationError);
      return null;
    }
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (loginError) {
      setError(
        loginError.code === "auth/popup-closed-by-user"
          ? ""
          : loginError.code === "auth/unauthorized-domain"
            ? "Este domínio não está autorizado no Firebase Authentication."
            : getErrorMessage(loginError, "Não foi possível entrar com o Google."),
      );
      return null;
    }
  }

  async function loginWithEmail(email, password) {
    setError("");
    if (!auth) {
      setError(firebaseConfigurationError);
      return null;
    }
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (loginError) {
      setError(formatAuthError(loginError));
      return null;
    }
  }

  async function registerWithEmail(email, password) {
    setError("");
    if (!auth) {
      setError(firebaseConfigurationError);
      return null;
    }
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (registerError) {
      setError(formatAuthError(registerError));
      return null;
    }
  }

  async function logout() {
    if (!auth) return;
    try {
      if (firebaseUser) await setUserPresence(firebaseUser.uid, "offline");
    } finally {
      await signOut(auth);
    }
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