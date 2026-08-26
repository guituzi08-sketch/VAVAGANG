import { Flame, Gamepad2, MessageCircle, Radio, Users, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { addMomentReaction, subscribeToMomentReactions, subscribeToRooms } from "../services/roomService";

const reactions = ["❤️", "😂", "🔥", "👏", "😮", "💀", "🎉"];

export default function MomentsPage() {
  const { firebaseUser } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => subscribeToRooms(setRooms, (snapshotError) => setError(snapshotError.message)), []);
  const activeRooms = rooms.filter((room) => (room.participantCount ?? 0) > 0);
  const peoplePresent = activeRooms.reduce((total, room) => total + (room.participantCount ?? 0), 0);

  return <div className="moments-page"><header className="moments-header"><div><p className="eyebrow">Presença em movimento</p><h1>VAVAGANG <em>MOMENTS</em></h1><p className="muted">Veja o que está acontecendo agora, com pessoas que realmente estão online.</p></div><div className="moments-signal"><span /> ao vivo</div></header><section className="moments-stats"><div><strong>{activeRooms.length}</strong><span>salas ativas</span></div><div><strong>{peoplePresent}</strong><span>pessoas presentes</span></div><div><strong>{activeRooms.length ? "agora" : "--"}</strong><span>atividade detectada</span></div></section>{error && <p className="settings-error">{error}</p>}<div className="moments-heading"><div><Flame size={18} /><h2>Moment feed</h2></div><span>Atualização em tempo real</span></div>{activeRooms.length === 0 ? <div className="moments-empty"><Zap size={26} /><h2>Nenhum momento acontecendo agora</h2><p>Quando alguém entrar em uma sala, o momento aparecerá aqui automaticamente.</p></div> : <div className="moments-grid">{activeRooms.map((room) => <MomentCard key={room.id} room={room} firebaseUser={firebaseUser} />)}</div>}</div>;
}

function MomentCard({ room, firebaseUser }) {
  const navigate = useNavigate();
  const [roomReactions, setRoomReactions] = useState([]);
  useEffect(() => subscribeToMomentReactions(room.id, setRoomReactions, () => {}), [room.id]);
  const counts = reactions.map((emoji) => ({ emoji, count: roomReactions.filter((reaction) => reaction.emoji === emoji).length })).filter((reaction) => reaction.count);
  async function react(emoji) { try { await addMomentReaction(room.id, firebaseUser.uid, emoji); } catch { setRoomReactions((current) => current); } }
  return <article className="moment-card"><div className="moment-card-top"><div className="moment-type"><span className="moment-live-dot" /><Radio size={16} /> <span>Em chamada</span></div><span className="moment-time">agora</span></div><div className="moment-main"><div className="moment-icon"><Gamepad2 size={22} /></div><div><h3>{room.name}</h3><p>{room.participantCount} {room.participantCount === 1 ? "pessoa está" : "pessoas estão"} reunidas nesta sala.</p></div></div><div className="moment-meta"><span><Users size={14} /> {room.participantCount} presentes</span><span>Atividade real da sala</span></div><div className="moment-actions"><button className="moment-join" onClick={() => navigate(`/voice/${room.id}`)}><MessageCircle size={15} /> Entrar no momento</button><div className="moment-reactions">{counts.map((reaction) => <span key={reaction.emoji}>{reaction.emoji} {reaction.count}</span>)}</div></div><div className="reaction-picker">{reactions.map((emoji) => <button key={emoji} onClick={() => react(emoji)} title={`Enviar reação ${emoji}`}>{emoji}</button>)}</div>{roomReactions.length > 0 && <div className="floating-reactions" aria-live="polite">{roomReactions.slice(-5).map((reaction) => <span key={reaction.id}>{reaction.emoji}</span>)}</div>}</article>;
}