import { AtSign, Bell, Camera, Flame, Headphones, Home, LogOut, MessageSquare, Mic, MicOff, MoreHorizontal, Plus, Search, Send, Settings, ShoppingBag, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useCall } from "../contexts/CallContext";
import { useDirectMessages } from "../contexts/DirectMessageContext";
import { createRoom, deleteRoom, subscribeToRooms } from "../services/roomService";
import ScreenShareViewer from "./ScreenShareViewer";
import { getErrorMessage } from "../utils/errorMessage";

const primaryNavigation = [
  { to: "/", label: "Início", icon: Home, end: true },
  { to: "/messages", label: "Mensagens", icon: MessageSquare },
  { to: "/friends", label: "Amigos", icon: UsersRound },
  { to: "/requests", label: "Notificações", icon: Bell },
  { to: "/moments", label: "Moments", icon: Flame },
  { to: "/vavax", label: "VavaX", icon: AtSign },
  { to: "/fortnite", label: "Loja Fortnite", icon: ShoppingBag },
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
  const { firebaseUser, profile, logout } = useAuth();
  const navigate = useNavigate();
  const { activeRoomId } = useCall();
  const { unreadCount, contact, messages, closePrivateChat, sendMessage, error: directMessageError } = useDirectMessages();
  const [rooms, setRooms] = useState([]);
  const [isRoomComposerOpen, setRoomComposerOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [isCreatingRoom, setCreatingRoom] = useState(false);
  const [roomError, setRoomError] = useState("");
  const [roomActionMenuId, setRoomActionMenuId] = useState(null);
  const [pendingRoomDelete, setPendingRoomDelete] = useState(null);
  const [deletingRoomId, setDeletingRoomId] = useState(null);
  const [directText, setDirectText] = useState("");
  const [isSendingDirectMessage, setSendingDirectMessage] = useState(false);
  useEffect(() => subscribeToRooms(setRooms, (error) => setRoomError(getErrorMessage(error, "Não foi possível carregar as salas."))), []);
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

  async function handleCreateRoom(event) {
    event.preventDefault();
    if (!roomName.trim() || isCreatingRoom) return;
    setCreatingRoom(true);
    try {
      const roomId = await createRoom(roomName, firebaseUser);
      setRoomName("");
      setRoomComposerOpen(false);
      setRoomError("");
      navigate(`/voice/${roomId}`);
    } catch (error) {
      setRoomError(getErrorMessage(error, "Não foi possível criar a sala."));
    } finally {
      setCreatingRoom(false);
    }
  }

  async function handleDeleteRoom(room) {
    if (!room || deletingRoomId) return;
    setPendingRoomDelete(null);
    setRoomActionMenuId(null);
    setDeletingRoomId(room.id);
    try {
      await deleteRoom(room.id, firebaseUser);
      setRoomError("");
    } catch (error) {
      setRoomError(getErrorMessage(error, "Não foi possível excluir a sala."));
    } finally {
      setDeletingRoomId(null);
    }
  }

  return <div className="workspace-shell">
    <aside className="community-rail" aria-label="Navegação principal">
      <NavLink className="rail-logo" to="/" title="Vavagang"><span>V</span></NavLink>
      <div className="rail-separator" />
      <RailButton label="Início" icon={Home} to="/" />
      <RailButton label="Amigos" icon={UsersRound} to="/friends" />
      <RailButton label="Loja Fortnite" icon={ShoppingBag} to="/fortnite" />
      <div className="rail-spacer" />
      <RailButton label="Notificações" icon={Bell} to="/requests" />
      <RailButton label="Vavagram" icon={Camera} to="/vavagram" />
    </aside>
    <aside className="navigation-panel" aria-label="Navegação da seção">
      <div className="navigation-header"><strong>VAVAGANG</strong><NavLink className="icon-button" to="/search" title="Pesquisar"><Search size={16} /></NavLink></div>
      <nav className="navigation-list">{primaryNavigation.map((item) => <NavItem item={item} key={item.to} unread={item.to === "/messages" ? unreadCount : 0} />)}<NavLink className="nav-item" to="/search"><Search size={18} /><span>Pesquisar</span></NavLink><div className="voice-navigation"><div className="channel-heading"><span>Voz</span><button className="nav-add" onClick={() => setRoomComposerOpen((current) => !current)} title="Criar sala"><Plus size={15} /></button></div><button className="voice-create-button" onClick={() => setRoomComposerOpen(true)}><Plus size={15} /> Criar sala</button>{isRoomComposerOpen && <form className="voice-create-form" onSubmit={handleCreateRoom}><input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Nome da sala" maxLength={60} autoFocus /><button className="primary-button" disabled={!roomName.trim() || isCreatingRoom}>{isCreatingRoom ? "Criando..." : "Criar"}</button></form>}{roomError && <p className="navigation-error">{roomError}</p>}{rooms.map((room) => <div className="voice-room-item" key={room.id}>{room.ownerId === firebaseUser?.uid && <div className="room-actions"><button className="icon-button voice-room-menu-trigger" type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setRoomActionMenuId((current) => (current === room.id ? null : room.id)); }} title="Mais opções"><MoreHorizontal size={13} /></button>{roomActionMenuId === room.id && <div className="room-menu"><button type="button" className="danger-action" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setPendingRoomDelete(room); setRoomActionMenuId(null); }}>Excluir sala</button></div>}</div>}{<NavLink className="nav-item voice-nav-item" to={`/voice/${room.id}`}><Headphones size={16} /><span>{room.name}</span><small>{room.participantCount ?? 0}</small></NavLink>}</div>)}{rooms.length === 0 && <p className="navigation-empty">Nenhuma sala disponível.</p>}</div></nav>
      <div className="navigation-footer"><div className="footer-user"><div className="avatar avatar-fallback">{profile?.displayName?.[0] ?? "V"}</div><div><strong>{profile?.displayName ?? "Usuário"}</strong><span>online no app</span></div></div><div className="footer-actions"><NavLink className="icon-button" to="/settings" title="Configurações"><Settings size={16} /></NavLink><button className="icon-button" onClick={logout} title="Sair"><LogOut size={16} /></button></div></div>
    </aside>
      <section className="workspace-main"><Outlet /></section>
    <div className="mobile-voice-navigation"><div className="mobile-voice-heading"><span>Voz</span><button onClick={() => setRoomComposerOpen((current) => !current)} title="Criar sala"><Plus size={15} /></button></div>{isRoomComposerOpen && <form className="mobile-voice-form" onSubmit={handleCreateRoom}><input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Nome da sala" maxLength={60} /><button className="primary-button" disabled={!roomName.trim() || isCreatingRoom}>{isCreatingRoom ? "Criando..." : "Criar"}</button></form>}<div className="mobile-voice-list">{rooms.map((room) => <NavLink to={`/voice/${room.id}`} key={room.id}><Headphones size={14} /><span>{room.name}</span></NavLink>)}{rooms.length === 0 && <span className="mobile-voice-empty">Nenhuma sala</span>}</div></div>
      {pendingRoomDelete && <div className="composer-backdrop" onClick={() => setPendingRoomDelete(null)}><div className="composer-modal confirmation-modal" onClick={(event) => event.stopPropagation()}><button className="composer-close" type="button" onClick={() => setPendingRoomDelete(null)} title="Fechar"><MoreHorizontal size={16} /></button><p className="eyebrow">Sala de voz</p><h2>Excluir sala de voz?</h2><p>Esta ação removerá a sala permanentemente.</p><div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setPendingRoomDelete(null)}>Cancelar</button><button className="destructive-button" type="button" onClick={() => handleDeleteRoom(pendingRoomDelete)} disabled={deletingRoomId === pendingRoomDelete.id}>{deletingRoomId === pendingRoomDelete.id ? "Excluindo..." : "Excluir"}</button></div></div></div>}
      {activeRoomId && <VoiceMiniPlayer onOpen={() => navigate(`/voice/${activeRoomId}`)} />}
      {contact && <PrivateChatOverlay contact={contact} messages={messages} error={directMessageError} text={directText} setText={setDirectText} isSending={isSendingDirectMessage} onClose={closePrivateChat} onSend={async (event) => { event.preventDefault(); if (isSendingDirectMessage || !directText.trim()) return; setSendingDirectMessage(true); try { await sendMessage(directText); setDirectText(""); } catch (error) { console.error("[DirectMessage] falha ao enviar pela interface", error); } finally { setSendingDirectMessage(false); } }} />}
  </div>;
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