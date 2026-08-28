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
  Paperclip,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  Share2,
  Smile,
  Sparkles,
  Users,
  Volume2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useCall } from "../contexts/CallContext";
import { subscribeToRooms } from "../services/roomService";

const demoMessages = [
  { name: "LucasZ", image: 1, tone: "cyan", time: "Hoje às 21:37", text: "Salve gang, quem on pra call?", reactions: ["🔥 6", "👀 4"] },
  { name: "Seven", image: 2, tone: "violet", time: "Hoje às 21:38", text: "Bora, chama na principal!" },
  { name: "Thay", image: 3, tone: "pink", time: "Hoje às 21:38", text: "", reactions: ["💜 3"] },
];

const voiceMembers = [
  { name: "LucasZ", image: 1, tone: "green" },
  { name: "Thay", image: 2, tone: "violet" },
  { name: "Seven", image: 3, tone: "blue" },
  { name: "Rick", image: 4, tone: "orange" },
  { name: "BabyJ", image: 5, tone: "pink" },
];

function Avatar({ image, profile, size = "normal" }) {
  if (profile?.photoURL && !image) return <img className={`dashboard-avatar ${size}`} src={profile.photoURL} alt="" />;
  return <img className={`dashboard-avatar ${size}`} src={`https://i.pravatar.cc/${size === "large" ? 64 : 40}?img=${image ?? 1}`} alt="" />;
}

export default function HomePage() {
  const { profile } = useAuth();
  const { enterCall, activeRoomId, participants, toggleAudio } = useCall();
  const [rooms, setRooms] = useState([]);
  const [message, setMessage] = useState("");
  const [muted, setMuted] = useState(false);
  const [channel, setChannel] = useState("chat-geral");
  const navigate = useNavigate();

  useEffect(() => subscribeToRooms(setRooms, () => {}), []);

  async function handleVoice(roomId) {
    await enterCall(roomId);
    navigate(`/voice/${roomId}`);
  }

  async function handleMute() {
    setMuted(!(await toggleAudio()));
  }

  return (
    <main className="vava-dashboard">
      <header className="dashboard-header">
        <div className="dashboard-channel-title"><Hash size={19} /><strong>{channel}</strong><span>Fique por dentro de tudo que acontece na VAVAGANG.</span></div>
        <div className="dashboard-header-actions"><button className="dashboard-icon" title="Notificações"><Bell size={18} /></button><button className="dashboard-icon" title="Fixados"><Sparkles size={18} /></button><button className="dashboard-icon" title="Membros"><Users size={18} /></button><label className="dashboard-search"><input placeholder="Buscar" aria-label="Buscar" /><Search size={16} /></label><button className="dashboard-icon" title="Ajuda"><CircleHelp size={18} /></button></div>
      </header>

      <div className="dashboard-body">
        <section className="dashboard-chat">
          <div className="dashboard-welcome"><span className="welcome-mark"><Hash size={22} /></span><h1>Bem-vindo ao <em>chat-geral</em></h1><p>Este é o começo do canal. Diga oi para a gang.</p></div>
          {demoMessages.map((item) => <article className="dashboard-message" key={item.name}>
            <Avatar image={item.image} size="large" />
            <div className="dashboard-message-content"><div className="dashboard-message-meta"><strong className={`tone-${item.tone}`}>{item.name}</strong><time>{item.time}</time></div>{item.text && <p>{item.text} {item.name === "LucasZ" && "👇"}</p>}{item.name === "Thay" && <div className="dashboard-media"><span>VAVA</span><small>clipe compartilhado pela gang</small></div>}{item.reactions && <div className="dashboard-reactions">{item.reactions.map((reaction) => <button key={reaction}>{reaction}</button>)}</div>}</div>
          </article>)}
          <form className="dashboard-composer" onSubmit={(event) => { event.preventDefault(); setMessage(""); }}><button type="button" title="Anexar arquivo"><Paperclip size={18} /></button><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={`Conversar em #${channel}`} /><button type="button" title="Emoji"><Smile size={18} /></button><button className="composer-send" type="submit" title="Enviar" disabled={!message.trim()}><Send size={17} /></button></form>
        </section>

        <aside className="dashboard-widgets">
          <section className="voice-card"><div className="widget-header"><div><strong>Sala Principal</strong><span className="connected"><i /> Conectado</span></div><div className="widget-tools"><Volume2 size={17} /><MoreHorizontal size={18} /></div></div><div className="voice-grid">{voiceMembers.map((member) => <div className={`voice-tile glow-${member.tone}`} key={member.name}><Avatar image={member.image} size="large" /><span>{member.name}</span></div>)}<button className="voice-tile invite-tile" onClick={() => rooms[0] && handleVoice(rooms[0].id)}><Plus size={23} /><span>Convidar</span></button></div><div className="voice-controls"><button title="Vídeo"><Gamepad2 size={18} /></button><button title="Compartilhar tela" onClick={() => activeRoomId && navigate(`/voice/${activeRoomId}`)}><Share2 size={18} /></button><button title={muted ? "Ativar microfone" : "Silenciar microfone"} onClick={handleMute} className={muted ? "is-muted" : ""}>{muted ? <MicOff size={18} /> : <Mic size={18} />}</button><button className="hangup" title="Abrir sala" onClick={() => rooms[0] && handleVoice(rooms[0].id)}><Headphones size={18} /></button></div></section>
          <section className="sound-card"><div className="widget-heading"><div><Sparkles size={17} /><strong>VAVASOUND</strong><b>NOVO</b></div><button title="Mais opções"><MoreHorizontal size={17} /></button></div><p>Efeitos sonoros para as calls</p><div className="sound-pads"><button title="Play"><Play size={16} /></button><button title="Efeito"><Sparkles size={16} /></button><button title="Som"><Volume2 size={16} /></button><button title="Mais sons"><Headphones size={16} /></button></div></section>
          <section className="track-card"><div><div className="track-brand"><span>♫</span><strong>VAVAGANG RADIO</strong></div><h2>Trap Neon</h2><p>Playlist da gang</p><div className="track-progress"><i /></div><small>02:37 <b>/ 03:45</b></small></div><div className="track-art"><span>V</span></div></section>
          {rooms.length > 0 && <section className="available-rooms"><div className="widget-heading"><strong>Salas disponíveis</strong><span>{rooms.length}</span></div>{rooms.slice(0, 3).map((room) => <button key={room.id} onClick={() => handleVoice(room.id)}><Volume2 size={15} /><span>{room.name}</span><small>{room.participantCount ?? 0}</small></button>)}</section>}
        </aside>
      </div>

      <aside className="dashboard-members"><div className="members-heading"><strong>MEMBROS — {Math.max(8, participants.length + 5)}</strong><button title="Pesquisar membros"><Search size={15} /></button></div><Member name={profile?.displayName ?? "LucasZ"} image={1} role="Dono" tone="gold" status="Jogando VAVAGANG" /><Member name="Thay" image={2} role="Admin" tone="violet" status="Gerenciando a VAVA" /><Member name="Seven" image={3} role="Admin" tone="blue" status="Ouvindo Spotify" /><Member name="Rick" image={4} role="Moderador" tone="green" status="Se cuida!" /><div className="member-group-label">ONLINE — 24</div><Member name="AlanZin" image={10} /><Member name="Bruno" image={11} /><Member name="Guh" image={12} /><NavLink to="/friends" className="members-see-all">Ver todos <ChevronDown size={14} /></NavLink></aside>
      <nav className="dashboard-mobile-nav"><NavLink to="/"><Compass size={18} /></NavLink><button onClick={() => setChannel("chat-geral")}><Hash size={18} /></button><NavLink to="/friends"><Users size={18} /></NavLink><NavLink to="/settings"><Settings size={18} /></NavLink></nav>
    </main>
  );
}

function Member({ name, image, role, tone = "default", status }) {
  return <div className="dashboard-member"><Avatar image={image} /><div><strong className={`tone-${tone}`}>{name}{role === "Dono" && " ♛"}</strong>{status && <span>{status}</span>}</div></div>;
}
