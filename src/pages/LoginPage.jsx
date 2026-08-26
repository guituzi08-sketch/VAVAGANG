import { LogIn, Sparkles } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const { loginWithGoogle, error } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function handleLogin() {
    setIsSigningIn(true);
    try { await loginWithGoogle(); } finally { setIsSigningIn(false); }
  }

  return (
    <main className="login-shell">
      <div className="login-noise" />
      <section className="login-panel">
        <div className="brand-mark"><Sparkles size={18} /> VAVAGANG</div>
        <div className="login-copy">
          <p className="eyebrow">Salas. Voz. Presença.</p>
          <h1>Entre na<br /><em>sua conta</em></h1>
          <p className="muted">Seu espaço para jogar, conversar e ficar junto.</p>
        </div>
        <button className="google-button" onClick={handleLogin} disabled={isSigningIn}>
          <span className="google-g">G</span>
          {isSigningIn ? "Conectando..." : "Continuar com Google"}
          <LogIn size={17} />
        </button>
        {error && <p className="error-message">{error}</p>}
        <p className="login-footnote">Ao entrar, você concorda em usar o Vavagang com respeito.</p>
      </section>
      <div className="login-visual"><span>01</span><strong>FIND<br />YOUR<br /><i>PEOPLE.</i></strong></div>
    </main>
  );
}