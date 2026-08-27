import { AtSign, Bell, Camera, Compass, Flame, Home, LogOut, MessageSquare, Mic, MicOff, MoreHorizontal, Plus, Search, Send, Settings, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useCall } from "../contexts/CallContext";
import { useDirectMessages } from "../contexts/DirectMessageContext";
import { useSocial } from "../contexts/SocialContext";
import { subscribeToRooms } from "../services/roomService";
import ScreenShareViewer from "./ScreenShareViewer";

const primaryNavigation = [
  { to: "/", label: "Início", icon: Home, end: true },
  { to: "/messages", label: "Mensagens", icon: MessageSquare },
  { to: "/friends", label: "Amigos", icon: UsersRound },
  { to: "/requests", label: "Notificações", icon: Bell },
  { to: "/moments", label: "Moments", icon: Flame },
  { to: "/vavax", label: "VavaX", icon: AtSign },
  { to: "/settings", label: "Configurações", icon: Settings },
];

function NavItem({ item, unread = 0 }) {
  const Icon = item.icon;
  return <NavLink className="nav-item" to={item.to} end={item.end} title={item.label}><Icon size={18} /><span>{item.label}</span>{unread > 0 && <b className="unread-badge">{unread > 9 ? "9+" : unread}</b>}</NavLink>;
}

function RailButton({ label, icon: Icon, to }) {
  return to ? <NavLink className="rail-button" to={to} title={label}><Icon size={19} /></NavLink> : <button className="rail-button" title={label}><Icon size={19} /></button>;
}

export default function AppShell() {
  const { profile, logout } = useAuth();
  const [rooms, setRooms] = useState([]);
  const navigate = useNavigate();
  const { activeRoomId } = useCall();
  const { groups } = useSocial();
  const { unreadCount, contact, messages, closePrivateChat, sendMessage, error: directMessageError } = useDirectMessages();
  const [directText, setDirectText] = useState("");
  const [isSendingDirectMessage, setSendingDirectMessage] = useState(false);
  useEffect(() => subscribeToRooms(setRooms, () => {}), []);
  useEffect(() => {
    function handleShortcut(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigate("/search");
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [navigate]);

  return <div className="workspace-shell">
    <aside className="community-rail" aria-label="Navegação principal">
      <NavLink className="rail-logo" to="/" title="Vavagang"><span>V</span></NavLink>
      <div className="rail-separator" />
      <RailButton label="Início" icon={Home} to="/" />
      <RailButton label="Amigos" icon={UsersRound} to="/friends" />
      <RailButton label="Comunidades" icon={Compass} to="/" />
      <div className="rail-spacer" />
      <RailButton label="Notificações" icon={Bell} to="/requests" />
      <RailButton label="Vavagram" icon={Camera} to="/vavagram" />
    </aside>
    <aside className="navigation-panel" aria-label="Navegação da seção">
      <div className="navigation-header"><strong>VAVAGANG</strong><button className="icon-button" title="Pesquisar"><Search size={16} /></button></div>
      <nav className="navigation-list">{primaryNavigation.map((item) => <NavItem item={item} key={item.to} unread={item.to === "/messages" ? unreadCount : 0} />)}<NavLink className="nav-item" to="/search"><Search size={18} /><span>Pesquisar</span></NavLink><div className="nav-divider" /><div className="channel-heading"><span>Grupos</span><button className="nav-add" onClick={() => navigate("/groups")} title="Criar grupo"><Plus size={15} /></button></div>{groups.map((group) => <NavLink className="nav-item" to={`/groups/${group.id}`} key={group.id}><span>🔥</span><span>{group.name}</span></NavLink>)}{groups.length === 0 && <p className="navigation-empty">Crie um grupo para organizar canais.</p>}<div className="channel-heading"><span>Meu espaço</span><button className="nav-add" onClick={() => navigate("/")} title="Criar sala"><Plus size={15} /></button></div><NavLink className="nav-item" to="/channels/general"><MessageSquare size={17} /><span>geral</span></NavLink><span className="nav-caption">Voz</span>{rooms.map((room) => <NavLink className="nav-item voice-nav-item" to={`/voice/${room.id}`} key={room.id}><span className="voice-glyph">🔊</span><span>{room.name}</span><small>{room.participantCount ?? 0}</small></NavLink>)}{rooms.length === 0 && <p className="navigation-empty">Suas salas de voz aparecerão aqui.</p>}</nav>
      <div className="navigation-footer"><div className="footer-user"><div className="avatar avatar-fallback">{profile?.displayName?.[0] ?? "V"}</div><div><strong>{profile?.displayName ?? "Usuário"}</strong><span>online no app</span></div></div><div className="footer-actions"><NavLink className="icon-button" to="/settings" title="Configurações"><Settings size={16} /></NavLink><button className="icon-button" onClick={logout} title="Sair"><LogOut size={16} /></button></div></div>
    </aside>
      <section className="workspace-main"><Outlet /></section>
      <ContextPanel />
      {activeRoomId && <VoiceMiniPlayer onOpen={() => navigate(`/voice/${activeRoomId}`)} />}
      {contact && <PrivateChatOverlay contact={contact} messages={messages} error={directMessageError} text={directText} setText={setDirectText} isSending={isSendingDirectMessage} onClose={closePrivateChat} onSend={async (event) => { event.preventDefault(); if (isSendingDirectMessage || !directText.trim()) return; setSendingDirectMessage(true); try { await sendMessage(directText); setDirectText(""); } catch {} finally { setSendingDirectMessage(false); } }} />}
  </div>;
}

  function ContextPanel() {
    const { profile } = useAuth();
    const presenceLabel = profile?.presenceStatus === "offline" ? "offline" : "online";
    return <aside className="context-panel" aria-label="Painel contextual"><div className="context-heading"><span>Seu espaço</span><span className="context-live">● {presenceLabel}</span></div><div className="context-profile"><div className="avatar avatar-fallback avatar-context">{profile?.displayName?.[0] ?? "V"}</div><strong>{profile?.displayName ?? "Usuário"}</strong><span>{profile?.email ?? ""}</span></div><div className="context-section"><span className="nav-caption">Presença no app</span><p>{presenceLabel === "online" ? "Sua sessão está ativa no aplicativo." : "Sua sessão está offline."}</p></div><div className="context-section"><span className="nav-caption">Atividade recente</span><p>Suas atividades aparecerão aqui quando você começar a usar o Vavagang.</p></div></aside>;
  }

function VoiceMiniPlayer({ onOpen }) {
  const { activeRoomId, participants, remoteScreenStreams, localStream, isConnecting, toggleAudio, exitCall } = useCall();
  const [audioEnabled, setAudioEnabled] = useState(true);
  const participantNames = participants.slice(0, 3).map((participant) => participant.displayName).join(" · ");
  useEffect(() => { setAudioEnabled(localStream?.getAudioTracks()[0]?.enabled ?? true); }, [localStream]);
  const sharedScreen = Object.entries(remoteScreenStreams ?? {}).find(([, stream]) => stream.getVideoTracks().length > 0);
  async function toggleMicrophone() { setAudioEnabled(await toggleAudio()); }
  return <aside className={`voice-mini-player ${sharedScreen ? "has-screen-share" : ""}`} aria-label="Chamada de voz ativa">{sharedScreen && <ScreenShareViewer stream={sharedScreen[1]} label="Tela compartilhada" compact />}{!sharedScreen && <div className="voice-mini-status"><span className="live-dot" /><div><strong>🔊 Sala ativa</strong><small>{isConnecting ? "Conectando..." : participantNames || activeRoomId}</small></div></div>}<div className="voice-mini-actions"><button className={`icon-button ${audioEnabled ? "" : "is-muted"}`} onClick={toggleMicrophone} title={audioEnabled ? "Silenciar microfone" : "Ativar microfone"}>{audioEnabled ? <Mic size={16} /> : <MicOff size={16} />}</button><button className="icon-button" onClick={onOpen} title="Voltar para o canal"><MoreHorizontal size={16} /></button><button className="icon-button voice-leave" onClick={exitCall} title="Sair da voz">×</button></div></aside>;
}

function PrivateChatOverlay({ contact, messages, error, text, setText, isSending, onClose, onSend }) {
  return <aside className="private-chat-overlay" role="dialog" aria-label={`Conversa com ${contact.displayName ?? "usuário"}`}><header><div><span className="presence-dot" /><strong>{contact.displayName ?? "Usuário"}</strong></div><button className="icon-button" onClick={onClose} title="Fechar conversa">×</button></header><div className="private-chat-messages">{!error && messages.length === 0 && <p className="voice-empty">Comece uma conversa privada.</p>}{!error && messages.map((message) => <article className={message.senderId === contact.uid ? "private-message incoming" : "private-message outgoing"} key={message.id}>{message.text}</article>)}{error && <p className="private-chat-error" role="alert">{error}</p>}</div><form onSubmit={onSend}><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Digite uma mensagem..." maxLength={500} disabled={isSending || Boolean(error)} /><button className="icon-button" disabled={!text.trim() || isSending || Boolean(error)} title="Enviar"><Send size={16} /></button></form></aside>;
}