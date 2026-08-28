import {
  Bell,
  ChevronDown,
  CircleHelp,
  Compass,
  Gamepad2,
  Headphones,
  Hash,
  Mic,
  MicOff,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  Users,
  Volume2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useCall } from "../contexts/CallContext";
import { createRoom, sendRoomMessage, subscribeToRoomMessages, subscribeToRooms } from "../services/roomService";

function Avatar({ image, profile, size = "normal" }) {
  if (profile?.photoURL) return <img className={`dashboard-avatar ${size}`} src={profile.photoURL} alt="" />;
  return <span className={`dashboard-avatar dashboard-avatar-fallback ${size}`} aria-label={profile?.displayName ?? "Usuário"}>{profile?.displayName?.[0] ?? "V"}</span>;
}

export default function HomePage() {
  const { firebaseUser, profile } = useAuth();
  const { enterCall, activeRoomId, participants, toggleAudio, shareScreen } = useCall();
  const [rooms, setRooms] = useState([]);
  const [roomMessages, setRoomMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [muted, setMuted] = useState(false);
  const [roomError, setRoomError] = useState("");
  const navigate = useNavigate();

  useEffect(() => subscribeToRooms(setRooms, (error) => setRoomError(error?.message || "Não foi possível carregar as salas.")), []);
  const selectedRoom = rooms[0];
  useEffect(() => {
    if (!selectedRoom) {
      setRoomMessages([]);
      return undefined;
    }
    return subscribeToRoomMessages(selectedRoom.id, setRoomMessages, setRoomError);
  }, [selectedRoom?.id]);

  async function handleVoice(roomId) {
    await enterCall(roomId);
    navigate(`/voice/${roomId}`);
  }

  async function handleMute() {
    setMuted(!(await toggleAudio()));
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!selectedRoom || !message.trim()) return;
    try {
      await sendRoomMessage(selectedRoom.id, { ...firebaseUser, ...profile }, message);
      setMessage("");
      setRoomError("");
    } catch (error) {
      setRoomError(error.message);
    }
  }

  async function handleCreateRoom(event) {
    event.preventDefault();
    if (!newRoomName.trim() || isCreatingRoom) return;
    setIsCreatingRoom(true);
    try {
      const roomId = await createRoom(newRoomName, firebaseUser);
      setNewRoomName("");
      navigate(`/voice/${roomId}`);
    } catch (error) {
      setRoomError(error.message);
    } finally {
      setIsCreatingRoom(false);
    }
  }

  return (
    <main className="vava-dashboard">
      <header className="dashboard-header">
        <div className="dashboard-channel-title"><Hash size={19} /><strong>{selectedRoom?.name ?? "chat-geral"}</strong><span>{selectedRoom ? "Conversa persistida na sala de voz." : "Crie ou entre em uma sala para conversar."}</span></div>
        <div className="dashboard-header-actions"><NavLink className="dashboard-icon" to="/requests" title="Notificações"><Bell size={18} /></NavLink><NavLink className="dashboard-icon" to="/groups" title="Comunidades"><Sparkles size={18} /></NavLink><NavLink className="dashboard-icon" to="/friends" title="Membros"><Users size={18} /></NavLink><form className="dashboard-search" onSubmit={(event) => { event.preventDefault(); navigate(`/search?query=${encodeURIComponent(event.currentTarget.elements.search.value)}`); }}><input name="search" placeholder="Buscar usuários" aria-label="Buscar usuários" /><Search size={16} /></form><NavLink className="dashboard-icon" to="/settings" title="Configurações"><CircleHelp size={18} /></NavLink></div>
      </header>

      <div className="dashboard-body">
        <section className="dashboard-chat">
          <div className="dashboard-welcome"><span className="welcome-mark"><Hash size={22} /></span><h1>Conversa da <em>{selectedRoom?.name ?? "VAVAGANG"}</em></h1><p>{selectedRoom ? "As mensagens são salvas para todos os participantes da sala." : "Nenhuma sala disponível. Crie uma sala para iniciar uma conversa real."}</p>{!selectedRoom && <form className="dashboard-create-room" onSubmit={handleCreateRoom}><input value={newRoomName} onChange={(event) => setNewRoomName(event.target.value)} placeholder="Nome da nova sala" maxLength={60} /><button className="primary-button" disabled={!newRoomName.trim() || isCreatingRoom}>{isCreatingRoom ? "Criando..." : "Criar sala"}</button></form>}</div>
          {roomError && <p className="error-message">{roomError}</p>}
          {selectedRoom && roomMessages.length === 0 && <div className="dashboard-empty">Nenhuma mensagem nesta sala. Seja o primeiro a escrever.</div>}
          {roomMessages.map((item) => <article className="dashboard-message" key={item.id}>
            <Avatar profile={item.authorId === firebaseUser?.uid ? profile : undefined} />
            <div className="dashboard-message-content"><div className="dashboard-message-meta"><strong>{item.authorName ?? "Jogador"}</strong><time>{formatMessageTime(item.createdAt)}</time></div><p>{item.text}</p></div>
          </article>)}
          <form className="dashboard-composer" onSubmit={sendMessage}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={selectedRoom ? "Escreva uma mensagem..." : "Entre em uma sala para conversar"} disabled={!selectedRoom} /><button className="composer-send" type="submit" title="Enviar" disabled={!selectedRoom || !message.trim()}><Send size={17} /></button></form>
        </section>

        <aside className="dashboard-widgets">
          <section className="voice-card"><div className="widget-header"><div><strong>{selectedRoom?.name ?? "Nenhuma sala ativa"}</strong><span className="connected"><i /> {selectedRoom ? `${selectedRoom.participantCount ?? 0} participante(s)` : "offline"}</span></div><div className="widget-tools"><Volume2 size={17} /><MoreHorizontal size={18} /></div></div><div className="voice-grid">{participants.length === 0 && <div className="dashboard-empty">Entre em uma sala para ver participantes.</div>}{participants.map((member) => <div className="voice-tile" key={member.uid}><Avatar profile={member} /><span>{member.displayName}</span></div>)}{selectedRoom && <button className="voice-tile invite-tile" onClick={() => handleVoice(selectedRoom.id)}><Plus size={23} /><span>Entrar</span></button>}</div><div className="voice-controls"><button title="Abrir câmera e voz" onClick={() => selectedRoom && handleVoice(selectedRoom.id)} disabled={!selectedRoom}><Gamepad2 size={18} /></button><button title="Compartilhar tela na sala" onClick={async () => { if (!activeRoomId && selectedRoom) await handleVoice(selectedRoom.id); await shareScreen(); }} disabled={!selectedRoom}><Share2 size={18} /></button><button title={muted ? "Ativar microfone" : "Silenciar microfone"} onClick={handleMute} className={muted ? "is-muted" : ""} disabled={!activeRoomId}>{muted ? <MicOff size={18} /> : <Mic size={18} />}</button><button className="hangup" title="Abrir sala" onClick={() => selectedRoom && handleVoice(selectedRoom.id)} disabled={!selectedRoom}><Headphones size={18} /></button></div></section>
          <section className="sound-card"><div className="widget-heading"><div><Sparkles size={17} /><strong>VAVASOUND</strong></div><NavLink to={selectedRoom ? `/voice/${selectedRoom.id}` : "/"} title="Abrir efeitos sonoros"><MoreHorizontal size={17} /></NavLink></div><p>Abra uma sala para carregar os efeitos compartilhados.</p><NavLink className="dashboard-widget-link" to={selectedRoom ? `/voice/${selectedRoom.id}` : "/"}>{selectedRoom ? "Abrir efeitos da sala" : "Nenhuma sala disponível"}</NavLink></section>
          <section className="track-card"><div><div className="track-brand"><span>♫</span><strong>ÁUDIO DA SALA</strong></div><h2>Controles de voz</h2><p>Câmera, microfone, tela e efeitos ficam disponíveis dentro da sala.</p><NavLink className="dashboard-widget-link" to={selectedRoom ? `/voice/${selectedRoom.id}` : "/"}>{selectedRoom ? "Abrir sala" : "Ver salas"}</NavLink></div><Headphones className="track-art-icon" size={38} /></section>
          {rooms.length > 0 && <section className="available-rooms"><div className="widget-heading"><strong>Salas disponíveis</strong><span>{rooms.length}</span></div>{rooms.slice(0, 3).map((room) => <button key={room.id} onClick={() => handleVoice(room.id)}><Volume2 size={15} /><span>{room.name}</span><small>{room.participantCount ?? 0}</small></button>)}</section>}
        </aside>
      </div>

      <aside className="dashboard-members"><div className="members-heading"><strong>MEMBROS — {participants.length}</strong><NavLink to="/friends" title="Pesquisar membros"><Search size={15} /></NavLink></div>{participants.length === 0 && <div className="dashboard-empty">Nenhum participante online nesta sala.</div>}{participants.map((member) => <Member key={member.uid} name={member.displayName} profile={member} status={member.muted ? "Microfone silenciado" : "Conectado"} />)}<NavLink to="/friends" className="members-see-all">Encontrar amigos <ChevronDown size={14} /></NavLink></aside>
      <nav className="dashboard-mobile-nav"><NavLink to="/"><Compass size={18} /></NavLink><NavLink to={selectedRoom ? `/voice/${selectedRoom.id}` : "/"}><Headphones size={18} /></NavLink><NavLink to="/friends"><Users size={18} /></NavLink><NavLink to="/settings"><Settings size={18} /></NavLink></nav>
    </main>
  );
}

function Member({ name, profile, status }) {
  return <div className="dashboard-member"><Avatar profile={profile} /><div><strong>{name}</strong>{status && <span>{status}</span>}</div></div>;
}

function formatMessageTime(timestamp) {
  if (!timestamp) return "agora";
  const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
