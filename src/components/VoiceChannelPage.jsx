import { Headphones, MessageCircle, Mic, MicOff, Send, Users, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useCall } from "../contexts/CallContext";
import { useDirectMessages } from "../contexts/DirectMessageContext";
import { sendRoomMessage, subscribeToRoomMessages } from "../services/roomService";

function RemoteAudio({ stream, volume = 1 }) {
  const audioRef = useRef(null);
  useEffect(() => { if (audioRef.current) audioRef.current.srcObject = stream; }, [stream]);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
  return <audio ref={audioRef} autoPlay />;
}

export default function VoiceChannelPage({ roomId }) {
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();
  const { openPrivateChat } = useDirectMessages();
  const { participants, remoteStreams, mediaError, roomClosed, roomClosedMessage, enterCall, exitCall, toggleAudio, localStream, isConnecting } = useCall();
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [messageError, setMessageError] = useState("");
  const [volumes, setVolumes] = useState({});
  const [volumeTarget, setVolumeTarget] = useState(null);

  useEffect(() => { enterCall(roomId); }, [roomId]);
  useEffect(() => subscribeToRoomMessages(roomId, setMessages, (error) => setMessageError(error.message)), [roomId]);
  useEffect(() => {
    if (!roomClosed) return;
    window.alert(roomClosedMessage || "Esta sala foi encerrada pelo proprietário.");
    navigate("/", { replace: true });
  }, [roomClosed, roomClosedMessage, navigate]);
  useEffect(() => { setAudioEnabled(localStream?.getAudioTracks()[0]?.enabled ?? true); }, [localStream]);

  async function submitMessage(event) {
    event.preventDefault();
    try {
      await sendRoomMessage(roomId, firebaseUser, messageText);
      setMessageText("");
      setMessageError("");
    } catch (error) { setMessageError(error.message); }
  }

  return <div className="voice-channel-page">
    <header className="voice-channel-header"><div><p className="eyebrow">Canal de voz</p><h1><span className="voice-glyph">🔊</span> {roomId}</h1><p className="muted">Conversa ao vivo com sua comunidade.</p></div><div className="voice-channel-state"><span className="live-dot" />{isConnecting ? "conectando" : "voz ativa"}</div></header>
    <div className="voice-channel-grid">
      <section className="voice-roster"><div className="voice-section-title"><span><Users size={16} /> Participantes</span><b>{participants.length}</b></div>
        {participants.length === 0 && <p className="voice-empty">{isConnecting ? "Entrando na sala..." : "Ninguém está conectado ainda."}</p>}
        <div className="voice-participant-list">{participants.map((participant) => {
          const participantVolume = volumes[participant.uid] ?? 1;
          const hasRemoteAudio = Boolean(remoteStreams[participant.uid]);
          return <div className="voice-participant" key={participant.uid}><span className="presence-dot" /><div><strong>{participant.displayName}</strong><small>{participant.uid === firebaseUser?.uid ? "Você" : "na sala"}</small></div><span className="participant-audio">{participant.muted ? <MicOff size={15} /> : <Mic size={15} />}</span>{participant.uid !== firebaseUser?.uid && <button className="icon-button participant-message" onClick={() => openPrivateChat({ uid: participant.uid, displayName: participant.displayName })} title="Mensagem privada"><MessageCircle size={15} /></button>}{hasRemoteAudio && <div className="participant-volume"><button className="icon-button" onClick={() => setVolumeTarget(volumeTarget === participant.uid ? null : participant.uid)} title="Volume individual">{participantVolume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>{volumeTarget === participant.uid && <input type="range" min="0" max="1" step="0.05" value={participantVolume} onChange={(event) => setVolumes((current) => ({ ...current, [participant.uid]: Number(event.target.value) }))} aria-label={`Volume de ${participant.displayName}`} />}</div>}</div>;
  })}</div>
+        {Object.entries(remoteStreams).map(([uid, stream]) => <RemoteAudio key={uid} stream={stream} volume={volumes[uid] ?? 1} />)}
+        <div className="voice-actions"><button className={`control-button ${audioEnabled ? "" : "off"}`} onClick={() => setAudioEnabled(toggleAudio())} title={audioEnabled ? "Silenciar" : "Ativar microfone"}>{audioEnabled ? <Mic /> : <MicOff />}</button><button className="secondary-button" onClick={async () => { await exitCall(); navigate("/"); }}><Volume2 size={15} /> Sair da voz</button></div>
+      </section>
+      <section className="room-chat"><div className="voice-section-title"><span><Headphones size={16} /> Chat da sala</span><span className="chat-live">tempo real</span></div><div className="room-message-list">{messages.length === 0 && <p className="voice-empty">As mensagens desta sala aparecerão aqui.</p>}{messages.map((message) => <article className="room-message" key={message.id}><strong>{message.authorName}</strong><p>{message.text}</p></article>)}</div>{messageError && <p className="error-message">{messageError}</p>}<form className="room-message-form" onSubmit={submitMessage}><input value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Conversar em voz..." maxLength={500} /><button className="icon-button" disabled={!messageText.trim()} title="Enviar mensagem"><Send size={16} /></button></form></section>
+    </div>
+    {mediaError && <p className="error-message voice-error">{mediaError}</p>}
+  </div>;
}
