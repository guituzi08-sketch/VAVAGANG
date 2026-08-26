import { LogOut, Plus, Radio, Users } from "lucide-react";
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
        <div className="home-intro"><div><p className="eyebrow">Seu lobby</p><h1>Olá, {profile?.displayName?.split(" ")[0] ?? "jogador"}.</h1><p className="muted">Encontre sua turma ou abra uma sala nova.</p></div><div className="profile-chip"><Avatar profile={profile} large /><div><strong>{profile?.displayName}</strong><span>{profile?.email}</span></div></div></div>
        <div className="dashboard-grid">
          <section className="create-panel"><div className="section-label"><span className="number">01</span><span>NOVA SALA</span></div><h2>Abra um espaço<br /><em>para sua gang.</em></h2><form onSubmit={handleCreate}><label htmlFor="room-name">Nome da sala</label><div className="input-row"><input id="room-name" value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="ex: ranked de sexta" maxLength={60} /><button className="primary-button" disabled={isCreating || !roomName.trim()}><Plus size={18} /> {isCreating ? "Criando" : "Criar sala"}</button></div></form></section>
          <section className="rooms-panel"><div className="section-heading"><div><span className="number">02</span><h2>Salas disponíveis</h2></div><span className="room-count">{rooms.length} {rooms.length === 1 ? "sala" : "salas"}</span></div>{error && <p className="error-message">{error}</p>}{rooms.length === 0 ? <div className="empty-state"><Radio size={25} /><p>Nenhuma sala aberta ainda.</p><span>Crie a primeira e chame sua gang.</span></div> : <div className="room-list">{rooms.map((room) => <article className="room-row" key={room.id}><div className="room-icon"><Radio size={18} /></div><div className="room-info"><strong>{room.name}</strong><span>por {room.createdByName ?? room.createdBy}</span></div><div className="room-participants"><Users size={15} /> {room.participantCount ?? 0}</div><button className="join-button" onClick={() => navigate(`/room/${room.id}`)}>Entrar <span>↗</span></button></article>)}</div>}</section>
        </div>
      </section>
    </main>
  );
}