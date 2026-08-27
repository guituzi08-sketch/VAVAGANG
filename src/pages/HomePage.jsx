import { Activity, Gamepad2, Globe2, LogOut, MoreVertical, Pencil, Plus, Radio, RadioTower, Trash2, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { createRoom, deleteRoom, subscribeToRooms, updateRoom } from "../services/roomService";

function Avatar({ profile, large = false }) {
  return profile?.photoURL ? <img className={`avatar ${large ? "avatar-large" : ""}`} src={profile.photoURL} alt="" /> : <div className={`avatar avatar-fallback ${large ? "avatar-large" : ""}`}>{profile?.displayName?.[0] ?? "V"}</div>;
}

export default function HomePage() {
  const { firebaseUser, profile, logout, error: authError } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [roomName, setRoomName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(authError);
  const [openMenu, setOpenMenu] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();

  function friendlyRoomError(error) {
    if (error.code === "permission-denied") return "Você não tem permissão para alterar esta sala.";
    if (error.code === "unavailable" || error.code === "deadline-exceeded") return "Não foi possível conectar ao Firebase. Tente novamente.";
    return error.message || "Não foi possível concluir a operação. Tente novamente.";
  }

  useEffect(() => subscribeToRooms(setRooms, (snapshotError) => setError(snapshotError.message)), []);

  async function handleCreate(event) {
    event.preventDefault();
    if (!roomName.trim()) return;
    setIsCreating(true);
    try {
      const roomId = await createRoom(roomName, firebaseUser);
      navigate(`/voice/${roomId}`);
    } catch (createError) { setError(createError.message); } finally { setIsCreating(false); }
  }

  function openEdit(room) {
    setOpenMenu(null);
    setEditTarget(room);
    setEditName(room.name);
    setEditDescription(room.description ?? "");
  }

  async function handleDelete() {
    if (!deleteTarget || (deleteTarget.ownerId ?? deleteTarget.createdBy) !== firebaseUser?.uid) return;
    setIsSaving(true);
    try {
      await deleteRoom(deleteTarget.id, firebaseUser);
      setDeleteTarget(null);
    } catch (deleteError) { setError(friendlyRoomError(deleteError)); } finally { setIsSaving(false); }
  }

  async function handleEdit(event) {
    event.preventDefault();
    if (!editTarget || (editTarget.ownerId ?? editTarget.createdBy) !== firebaseUser?.uid || !editName.trim()) return;
    setIsSaving(true);
    try {
      await updateRoom(editTarget.id, { name: editName, description: editDescription });
      setEditTarget(null);
    } catch (editError) { setError(friendlyRoomError(editError)); } finally { setIsSaving(false); }
  }

  return (
    <main className="app-shell">
      <header className="topbar"><div className="brand-mark"><Radio size={17} /> VAVAGANG</div><div className="user-menu"><span>{profile?.displayName}</span><Avatar profile={profile} /><button className="icon-button" onClick={logout} title="Sair"><LogOut size={17} /></button></div></header>
      <section className="home-content">
        <div className="home-intro"><div className="home-hero-copy"><p className="eyebrow">VAVAGANG // MAIN MENU</p><h1>ENTER THE<br /><em>HUB</em></h1><p className="muted">Bom te ver novamente, {profile?.displayName?.split(" ")[0] ?? "jogador"}. Escolha seu próximo espaço.</p><div className="home-hero-meta"><span><b /> SECTOR 07</span><span><b /> VOICE MESH ONLINE</span><span>BUILD 2.0.26</span></div></div><div className="profile-chip"><Avatar profile={profile} large /><div><strong>{profile?.displayName}</strong><span>{profile?.email}</span></div></div><div className="home-arena" aria-hidden="true"><div className="arena-grid" /><div className="arena-ring arena-ring-back" /><div className="arena-ring arena-ring-front" /><div className="arena-ring arena-ring-inner" /><div className="arena-core"><span>V</span></div><span className="arena-label arena-label-top">LIVE // HUB</span><span className="arena-label arena-label-side">SYSTEM READY</span><span className="arena-label arena-label-bottom">NO SIGNAL // NO LIMITS</span></div></div>
        <HubOverview rooms={rooms} />
        <div className="dashboard-grid">
          <section className="create-panel"><div className="section-label"><span className="number">01</span><span>NOVA SALA</span></div><h2>Abra um espaço<br /><em>para sua gang.</em></h2><form onSubmit={handleCreate}><label htmlFor="room-name">Nome da sala</label><div className="input-row"><input id="room-name" value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="ex: ranked de sexta" maxLength={60} /><button className="primary-button" disabled={isCreating || !roomName.trim()}><Plus size={18} /> {isCreating ? "Criando" : "Criar sala"}</button></div></form></section>
          <section className="rooms-panel"><div className="section-heading"><div><span className="number">02</span><h2>Salas disponíveis</h2></div><span className="room-count">{rooms.length} {rooms.length === 1 ? "sala" : "salas"}</span></div>{error && <p className="error-message">{error}</p>}{rooms.length === 0 ? <div className="empty-state"><Radio size={25} /><p>Nenhuma sala aberta ainda.</p><span>Crie a primeira e chame sua gang.</span></div> : <div className="room-list">{rooms.map((room) => { const isOwner = (room.ownerId ?? room.createdBy) === firebaseUser?.uid; return <article className="room-row" key={room.id}><div className="room-icon"><Radio size={18} /></div><div className="room-info"><strong>{room.name}</strong><span>por {room.createdByName ?? room.createdBy}</span></div><div className="room-participants"><Users size={15} /> {room.participantCount ?? 0}</div><button className="join-button" onClick={() => navigate(`/voice/${room.id}`)}>Entrar <span>↗</span></button>{isOwner && <div className="room-actions"><button className="icon-button" onClick={() => setOpenMenu(openMenu === room.id ? null : room.id)} title="Opções da sala"><MoreVertical size={17} /></button>{openMenu === room.id && <div className="room-menu"><button onClick={() => openEdit(room)}><Pencil size={14} /> Editar sala</button><button className="danger-action" onClick={() => { setOpenMenu(null); setDeleteTarget(room); }}><Trash2 size={14} /> Excluir sala</button></div>}</div>}</article>; })}</div>}</section>
        </div>
      </section>
      {deleteTarget && <div className="composer-backdrop"><section className="composer-modal confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="delete-room-title"><button className="composer-close" onClick={() => setDeleteTarget(null)} title="Cancelar"><X size={17} /></button><span className="eyebrow">Ação permanente</span><h2 id="delete-room-title">Excluir sala?</h2><p>Você tem certeza que deseja excluir <strong>"{deleteTarget.name}"</strong>?</p><p className="muted">Essa ação não poderá ser desfeita.</p>{deleteTarget.participantCount > 0 && <p className="warning-message">Você está dentro desta sala. Ao excluir, todos os participantes serão desconectados.</p>}<div className="modal-actions"><button className="secondary-button" onClick={() => setDeleteTarget(null)}>Cancelar</button><button className="destructive-button" onClick={handleDelete} disabled={isSaving}><Trash2 size={15} /> {isSaving ? "Excluindo" : "Excluir sala"}</button></div></section></div>}
      {editTarget && <div className="composer-backdrop"><form className="composer-modal" onSubmit={handleEdit} role="dialog" aria-modal="true" aria-labelledby="edit-room-title"><button type="button" className="composer-close" onClick={() => setEditTarget(null)} title="Cancelar"><X size={17} /></button><span className="eyebrow">Configurações da sala</span><h2 id="edit-room-title">Editar sala</h2><label className="modal-label" htmlFor="edit-room-name">Nome da sala</label><input className="modal-input" id="edit-room-name" value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={60} required /><label className="modal-label" htmlFor="edit-room-description">Descrição</label><textarea className="modal-input modal-textarea" id="edit-room-description" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={240} /><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditTarget(null)}>Cancelar</button><button className="primary-button" disabled={isSaving}>{isSaving ? "Salvando" : "Salvar alterações"}</button></div></form></div>}
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