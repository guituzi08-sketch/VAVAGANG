import { ExternalLink, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";

const shopUrl = "https://4nite.site/pt/loja-fortnite";

export default function FortniteShopPage() {
  const [showFallback, setShowFallback] = useState(false);
  const [frameKey, setFrameKey] = useState(0);

  useEffect(() => {
    setShowFallback(false);
    const fallbackTimer = window.setTimeout(() => setShowFallback(true), 5000);
    return () => window.clearTimeout(fallbackTimer);
  }, [frameKey]);

  return (
    <main className="fortnite-shop-page">
      <header className="fortnite-shop-header">
        <div>
          <p className="eyebrow">VAVAGANG / Loja</p>
          <h1>Loja Fortnite</h1>
          <p className="muted">Confira os itens disponíveis diretamente no site oficial.</p>
        </div>
        <a className="secondary-button fortnite-external-link" href={shopUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={15} /> Abrir em nova aba
        </a>
      </header>
      <section className={`fortnite-shop-frame ${showFallback ? "is-blocked" : ""}`} aria-label="Loja de itens do Fortnite">
        <div className="fortnite-shop-frame-heading">
          <span><ShoppingBag size={16} /> Loja oficial</span>
          <a href={shopUrl} target="_blank" rel="noreferrer">fortnite.com</a>
        </div>
        <div className="fortnite-shop-content">
          <iframe key={frameKey} src={shopUrl} title="Loja de itens do Fortnite" loading="lazy" />
          {showFallback && <div className="fortnite-shop-fallback">
            <ShoppingBag size={34} />
            <p className="eyebrow">Site oficial</p>
            <h2>A loja não pode ser exibida neste bloco</h2>
            <p>O Fortnite impede oficialmente a incorporação em outros sites. A loja continua disponível no site oficial.</p>
            <div className="fortnite-fallback-actions">
              <button className="secondary-button" onClick={() => setFrameKey((current) => current + 1)}>Tentar novamente</button>
              <a className="primary-button" href={shopUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Abrir no site</a>
            </div>
          </div>}
        </div>
      </section>
    </main>
  );
}
