import { ExternalLink, ShoppingBag } from "lucide-react";

const shopUrl = "https://4nite.site/pt/loja-fortnite";

export default function FortniteShopPage() {
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
      <section className="fortnite-shop-frame" aria-label="Loja de itens do Fortnite">
        <div className="fortnite-shop-frame-heading">
          <span><ShoppingBag size={16} /> Loja oficial</span>
          <a href={shopUrl} target="_blank" rel="noreferrer">fortnite.com</a>
        </div>
        <div className="fortnite-shop-content"><iframe src={shopUrl} title="Loja de itens do Fortnite" loading="lazy" /></div>
      </section>
    </main>
  );
}
