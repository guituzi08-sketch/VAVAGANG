import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
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
    <AuthContext.Provider value={{ firebaseUser, profile, loading, error, loginWithGoogle, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}