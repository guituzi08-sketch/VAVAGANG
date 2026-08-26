import { Bell, Compass, Flame, Home, MessageSquare, Plus, Search, Settings, UsersRound } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const primaryNavigation = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/friends", label: "Amigos", icon: UsersRound },
  { to: "/messages", label: "Mensagens", icon: MessageSquare },
  { to: "/moments", label: "Moments", icon: Flame },
];

function NavItem({ item }) {
  const Icon = item.icon;
  return <NavLink className="nav-item" to={item.to} end={item.end} title={item.label}><Icon size={18} /><span>{item.label}</span></NavLink>;
}

function RailButton({ label, icon: Icon, to }) {
  if (to) return <NavLink className="rail-button" to={to} title={label}><Icon size={19} /></NavLink>;
  return <button className="rail-button" title={label}><Icon size={19} /></button>;
}

export default function AppShell() {
  const { profile } = useAuth();
  const location = useLocation();
  const inCommunity = location.pathname.startsWith("/groups/") || location.pathname.startsWith("/channels/");

  return <div className="workspace-shell">
    <aside className="community-rail" aria-label="Navegação principal">
      <NavLink className="rail-logo" to="/" title="Vavagang"><span>V</span></NavLink>
      <div className="rail-separator" />
      <RailButton label="Home" icon={Home} to="/" />
      <RailButton label="Amigos" icon={UsersRound} to="/friends" />
      <RailButton label="Comunidades" icon={Compass} />
      <div className="rail-spacer" />
      <RailButton label="Notificações" icon={Bell} />
      <RailButton label="Adicionar comunidade" icon={Plus} />
    </aside>
    <aside className="navigation-panel" aria-label="Navegação da seção">
      <div className="navigation-header"><strong>{inCommunity ? "Comunidade" : "Vavagang"}</strong><button className="icon-button" title="Pesquisar"><Search size={16} /></button></div>
      {inCommunity ? <CommunityNavigation /> : <HomeNavigation />}
      <div className="navigation-footer"><div className="footer-user"><div className="avatar avatar-fallback">{profile?.displayName?.[0] ?? "V"}</div><div><strong>{profile?.displayName ?? "Usuário"}</strong><span>online</span></div></div><NavLink className="icon-button" to="/settings" title="Configurações"><Settings size={16} /></NavLink></div>
    </aside>
      <section className="workspace-main"><Outlet /></section>
      <ContextPanel />
  </div>;
}

  function ContextPanel() {
    const { profile } = useAuth();
    return <aside className="context-panel" aria-label="Painel contextual"><div className="context-heading"><span>Seu espaço</span><span className="context-live">● online</span></div><div className="context-profile"><div className="avatar avatar-fallback avatar-context">{profile?.displayName?.[0] ?? "V"}</div><strong>{profile?.displayName ?? "Usuário"}</strong><span>{profile?.email ?? ""}</span></div><div className="context-section"><span className="nav-caption">Amigos online</span><p>Nenhum amigo online ainda.</p></div><div className="context-section"><span className="nav-caption">Atividade recente</span><p>Suas atividades aparecerão aqui quando você começar a usar o Vavagang.</p></div></aside>;
  }

function HomeNavigation() {
  return <nav className="navigation-list">{primaryNavigation.map((item) => <NavItem item={item} key={item.to} />)}<div className="nav-divider" /><NavItem item={{ to: "/requests", label: "Solicitações", icon: Bell }} /><span className="nav-caption">Atividade</span><p className="navigation-empty">Suas comunidades e grupos aparecerão aqui quando você entrar.</p></nav>;
}

function CommunityNavigation() {
  return <nav className="navigation-list"><NavLink className="nav-item" to="/"><Home size={18} /><span>Voltar ao home</span></NavLink><span className="nav-caption">Canais de texto</span><NavLink className="nav-item" to="/channels/general"><MessageSquare size={17} /><span>geral</span></NavLink><span className="nav-caption">Canais de voz</span><NavLink className="nav-item" to="/voice/general"><UsersRound size={17} /><span>Sala Geral</span></NavLink></nav>;
}