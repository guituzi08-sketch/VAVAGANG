import { LogIn, Sparkles } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const { loginWithGoogle, loginWithEmail, registerWithEmail, error } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin() {
    setIsSigningIn(true);
    try { await loginWithGoogle(); } finally { setIsSigningIn(false); }
  }

  async function handleEmail(event) {
    event.preventDefault();
    setIsSigningIn(true);
    try {
      if (isRegistering) await registerWithEmail(email, password);
      else await loginWithEmail(email, password);
    } finally { setIsSigningIn(false); }
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
        <form className="login-email-form" onSubmit={handleEmail}>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-mail" autoComplete="email" required />
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Senha" autoComplete={isRegistering ? "new-password" : "current-password"} minLength={6} required />
          <button className="secondary-button" disabled={isSigningIn}>{isSigningIn ? "Aguarde..." : isRegistering ? "Criar conta" : "Entrar com e-mail"}</button>
          <button type="button" className="login-switch" onClick={() => setIsRegistering((current) => !current)}>{isRegistering ? "Já tenho uma conta" : "Criar conta com e-mail"}</button>
        </form>
        {error && <p className="error-message">{error}</p>}
        <p className="login-footnote">Ao entrar, você concorda em usar o Vavagang com respeito.</p>
      </section>
      <div className="login-visual"><span>01</span><strong>FIND<br />YOUR<br /><i>PEOPLE.</i></strong></div>
    </main>
  );
}