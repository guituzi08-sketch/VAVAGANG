import { Activity, Gamepad2, Globe2, LogOut, Plus, Radio, RadioTower, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { createRoom, subscribeToRooms } from "../services/roomService";

function Avatar({ profile, large = false }) {
  return profile?.photoURL ? <img className={`avatar ${large ? "avatar-large" : ""}`} src={profile.photoURL} alt="" /> : <div className={`avatar avatar-fallback ${large ? "avatar-large" : ""}`}>{profile?.displayName?.[0] ?? "V"}</div>;
}

export default function HomePage() {
  const { firebaseUser, profile, logout, error: authError } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [roomName, setRoomName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(authError);
  const navigate = useNavigate();

  useEffect(() => subscribeToRooms(setRooms, (snapshotError) => setError(snapshotError.message)), []);

  async function handleCreate(event) {
    event.preventDefault();
    if (!roomName.trim()) return;
    setIsCreating(true);
    try {
      const roomId = await createRoom(roomName, firebaseUser);
      navigate(`/room/${roomId}`);
    } catch (createError) { setError(createError.message); } finally { setIsCreating(false); }
  }

  return (
    <main className="app-shell">
      <header className="topbar"><div className="brand-mark"><Radio size={17} /> VAVAGANG</div><div className="user-menu"><span>{profile?.displayName}</span><Avatar profile={profile} /><button className="icon-button" onClick={logout} title="Sair"><LogOut size={17} /></button></div></header>
      <section className="home-content">
        <div className="home-intro"><div><p className="eyebrow">Painel social</p><h1>VAVAGANG <em>HUB</em></h1><p className="muted">Bom te ver novamente, {profile?.displayName?.split(" ")[0] ?? "jogador"}.</p></div><div className="profile-chip"><Avatar profile={profile} large /><div><strong>{profile?.displayName}</strong><span>{profile?.email}</span></div></div></div>
        <HubOverview rooms={rooms} />
        <div className="dashboard-grid">
          <section className="create-panel"><div className="section-label"><span className="number">01</span><span>NOVA SALA</span></div><h2>Abra um espaço<br /><em>para sua gang.</em></h2><form onSubmit={handleCreate}><label htmlFor="room-name">Nome da sala</label><div className="input-row"><input id="room-name" value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="ex: ranked de sexta" maxLength={60} /><button className="primary-button" disabled={isCreating || !roomName.trim()}><Plus size={18} /> {isCreating ? "Criando" : "Criar sala"}</button></div></form></section>
          <section className="rooms-panel"><div className="section-heading"><div><span className="number">02</span><h2>Salas disponíveis</h2></div><span className="room-count">{rooms.length} {rooms.length === 1 ? "sala" : "salas"}</span></div>{error && <p className="error-message">{error}</p>}{rooms.length === 0 ? <div className="empty-state"><Radio size={25} /><p>Nenhuma sala aberta ainda.</p><span>Crie a primeira e chame sua gang.</span></div> : <div className="room-list">{rooms.map((room) => <article className="room-row" key={room.id}><div className="room-icon"><Radio size={18} /></div><div className="room-info"><strong>{room.name}</strong><span>por {room.createdByName ?? room.createdBy}</span></div><div className="room-participants"><Users size={15} /> {room.participantCount ?? 0}</div><button className="join-button" onClick={() => navigate(`/room/${room.id}`)}>Entrar <span>↗</span></button></article>)}</div>}</section>
        </div>
      </section>
    </main>
  );
}

function HubOverview({ rooms }) {
  const activeRooms = rooms.filter((room) => (room.participantCount ?? 0) > 0);
  const peopleInRooms = activeRooms.reduce((total, room) => total + (room.participantCount ?? 0), 0);
  return <section className="hub-overview"><div className="hub-heading"><div><span className="number">00</span><h2>Agora no Vavagang</h2></div><Activity size={17} /></div><div className="hub-grid"><HubPanel className="hub-rooms" icon={Gamepad2} label="Salas ativas"><strong className="hub-value">{activeRooms.length}</strong><span>{peopleInRooms} {peopleInRooms === 1 ? "pessoa" : "pessoas"} conectadas</span>{activeRooms.length > 0 ? <div className="hub-room-list">{activeRooms.slice(0, 3).map((room) => <div className="hub-room" key={room.id}><span>{room.name}</span><b>{room.participantCount}</b></div>)}</div> : <p className="hub-empty">Nenhuma sala com participantes agora.</p>}</HubPanel><HubPanel icon={Users} label="Pessoas online"><strong className="hub-value">{peopleInRooms}</strong><span>participantes em salas</span><p className="hub-empty">Nomes aparecerão quando a presença social estiver disponível.</p></HubPanel><HubPanel icon={Globe2} label="Comunidades em alta"><strong className="hub-value">--</strong><span>sem comunidades conectadas</span><p className="hub-empty">As comunidades reais aparecerão aqui quando você entrar em uma.</p></HubPanel><HubPanel icon={RadioTower} label="Ao vivo"><strong className="hub-value">--</strong><span>nenhuma transmissão detectada</span><p className="hub-empty">Transmissões serão exibidas quando alguém compartilhar a tela.</p></HubPanel></div></section>;
}

function HubPanel({ icon: Icon, label, children, className = "" }) {
  return <article className={`hub-panel ${className}`}><div className="hub-panel-label"><Icon size={16} /><span>{label}</span></div>{children}</article>;
}