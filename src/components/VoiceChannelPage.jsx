import { Headphones, MessageCircle, Mic, MicOff, MonitorUp, Music2, Send, Trash2, Upload, Users, Volume2, VolumeX } from "lucide-react";
import { Component, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useCall } from "../contexts/CallContext";
import { useDirectMessages } from "../contexts/DirectMessageContext";
import { useSoundEffects } from "../contexts/SoundEffectsContext";
import { sendRoomMessage, subscribeToRoomMessages } from "../services/roomService";
import ScreenShareViewer from "./ScreenShareViewer";

export default function VoiceChannelPage({ roomId }) {
  return <VoiceErrorBoundary roomId={roomId}><VoiceChannelContent roomId={roomId} /></VoiceErrorBoundary>;
}

class VoiceErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error) { console.error("[VoiceChannel] render error", error); }
  render() {
    if (this.state.hasError) return <main className="voice-channel-page"><section className="workspace-empty"><h2>Não foi possível conectar à sala de voz.</h2><button className="secondary-button" onClick={() => this.setState({ hasError: false })}>Tentar novamente</button></section></main>;
    return this.props.children;
  }
}

function VoiceChannelContent({ roomId }) {
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();
  const { openPrivateChat } = useDirectMessages();
  const { effects, error: soundError, audioBlocked, setAudioBlocked, trigger, upload, remove } = useSoundEffects(roomId);
  const { participants, remoteStreams, remoteScreenStreams, screenStream, mediaError, roomClosed, roomClosedMessage, enterCall, exitCall, toggleAudio, shareScreen, stopScreenShare, localStream, isConnecting } = useCall();
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [messageError, setMessageError] = useState("");
  const [volumes, setVolumes] = useState({});
  const [volumeTarget, setVolumeTarget] = useState(null);
  const [soundName, setSoundName] = useState("");

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
    try { await sendRoomMessage(roomId, firebaseUser, messageText); setMessageText(""); setMessageError(""); } catch (error) { setMessageError(error.message); }
  }

  async function submitSoundEffect(event) {
    event.preventDefault();
    const file = event.currentTarget.elements.soundFile.files[0];
    if (!file) return;
    try {
      await upload(file, soundName);
      event.currentTarget.reset();
      setSoundName("");
    } catch {}
  }

  const sharedScreens = Object.entries(remoteScreenStreams ?? {}).filter(([, stream]) => stream.getVideoTracks().length > 0);
  return <div className="voice-channel-page">
    <header className="voice-channel-header"><div><p className="eyebrow">Canal de voz</p><h1><span className="voice-glyph">🔊</span> {roomId}</h1><p className="muted">Conversa ao vivo com sua comunidade.</p></div><div className="voice-channel-state"><span className="live-dot" />{isConnecting ? "conectando" : "voz ativa"}</div></header>
    {screenStream && <section className="screen-share-stage"><ScreenShareViewer stream={screenStream} label="Você está compartilhando a tela" muted /></section>}
    {sharedScreens.map(([uid, stream]) => <section className="screen-share-stage" key={uid}><ScreenShareViewer stream={stream} label={`${participants.find((participant) => participant.uid === uid)?.displayName ?? "Participante"} está compartilhando a tela`} /></section>)}
    <div className="voice-channel-grid">
      <section className="voice-roster"><div className="voice-section-title"><span><Users size={16} /> Participantes</span><b>{participants.length}</b></div>
        {participants.length === 0 && <p className="voice-empty">{isConnecting ? "Entrando na sala..." : "Ninguém está conectado ainda."}</p>}
        <div className="voice-participant-list">{participants.map((participant) => {
          const participantVolume = volumes[participant.uid] ?? 1;
          const hasRemoteAudio = Boolean(remoteStreams[participant.uid]);
          const isSharing = Boolean(remoteScreenStreams?.[participant.uid]?.getVideoTracks().length) || participant.screenSharing;
          return <div className="voice-participant" key={participant.uid}><span className="presence-dot" /><div><strong>{participant.displayName}</strong><small>{participant.uid === firebaseUser?.uid ? "Você" : "na sala"}</small></div><span className="participant-audio">{participant.muted ? <MicOff size={15} /> : <Mic size={15} />}</span>{isSharing && <span className="screen-share-label">📺 {participant.screenAudio ? "🔊" : ""}</span>}{participant.uid !== firebaseUser?.uid && <button className="icon-button participant-message" onClick={() => openPrivateChat({ uid: participant.uid, displayName: participant.displayName })} title="Mensagem privada"><MessageCircle size={15} /></button>}{hasRemoteAudio && <div className="participant-volume"><button className="icon-button" onClick={() => setVolumeTarget(volumeTarget === participant.uid ? null : participant.uid)} title="Volume individual">{participantVolume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>{volumeTarget === participant.uid && <input type="range" min="0" max="1" step="0.05" value={participantVolume} onChange={(event) => setVolumes((current) => ({ ...current, [participant.uid]: Number(event.target.value) }))} aria-label={`Volume de ${participant.displayName}`} />}</div>}</div>;
        })}</div>
        {Object.entries(remoteStreams).map(([uid, stream]) => <RemoteAudio key={uid} stream={stream} volume={volumes[uid] ?? 1} onBlocked={() => setAudioBlocked(true)} />)}
        {audioBlocked && <button className="secondary-button" onClick={() => { document.querySelectorAll("audio").forEach((audio) => audio.play().catch((error) => console.error("[VOICE DEBUG] audio.play failed", error))); setAudioBlocked(false); }}>Ativar áudio</button>}
        <div className="voice-actions"><button className={`control-button ${audioEnabled ? "" : "off"}`} onClick={() => setAudioEnabled(toggleAudio())} title={audioEnabled ? "Silenciar" : "Ativar microfone"}>{audioEnabled ? <Mic /> : <MicOff />}</button><button className={`control-button screen-share-action ${screenStream ? "active" : ""}`} onClick={screenStream ? stopScreenShare : shareScreen} title={screenStream ? "Parar compartilhamento" : "Compartilhar tela"}><MonitorUp /><span>{screenStream ? "Parar compartilhamento" : "Compartilhar tela"}</span></button><button className="secondary-button" onClick={async () => { await exitCall(); navigate("/"); }}><Volume2 size={15} /> Sair da voz</button></div>
      </section>
      <section className="room-chat"><div className="voice-section-title"><span><Headphones size={16} /> Chat da sala</span><span className="chat-live">tempo real</span></div><div className="room-message-list">{messages.length === 0 && <p className="voice-empty">As mensagens desta sala aparecerão aqui.</p>}{messages.map((message) => <article className="room-message" key={message.id}><strong>{message.authorName}</strong><p>{message.text}</p></article>)}</div>{messageError && <p className="error-message">{messageError}</p>}<form className="room-message-form" onSubmit={submitMessage}><input value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Conversar em voz..." maxLength={500} /><button className="icon-button" disabled={!messageText.trim()} title="Enviar mensagem"><Send size={16} /></button></form></section>
      <section className="sound-effects-panel"><div className="voice-section-title"><span><Music2 size={16} /> Efeitos sonoros</span><span className="chat-live">compartilhado</span></div><div className="sound-effect-list">{effects.length === 0 && <p className="voice-empty">Adicione um efeito para a sala.</p>}{effects.map((effect, index) => <div className="sound-effect-pad-wrap" key={effect.id}><button className="sound-effect-button" style={{ "--pad-accent": ["#5aa7ff", "#61d8b0", "#a993ff", "#ffb86b"][index % 4] }} onClick={() => trigger(effect)} title={`Reproduzir ${effect.name}`}><Music2 size={20} /><span>{effect.name}</span></button>{effect.createdBy === firebaseUser?.uid && <button className="sound-effect-delete" onClick={async () => { if (!window.confirm(`Excluir o efeito \"${effect.name}\"?`)) return; try { await remove(effect); } catch {} }} title="Excluir efeito"><Trash2 size={13} /> Excluir</button>}</div>)}</div><form className="sound-effect-form" onSubmit={submitSoundEffect}><input value={soundName} onChange={(event) => setSoundName(event.target.value)} placeholder="Nome opcional" maxLength={60} /><label className="sound-upload-button" title="Selecionar MP3 ou WAV"><Upload size={15} /><span>Adicionar áudio</span><input name="soundFile" type="file" accept="audio/mpeg,audio/wav,audio/x-wav" /></label><button className="secondary-button sound-upload-submit" type="submit">Enviar</button></form>{soundError && <p className="error-message">{soundError}</p>}{audioBlocked && <button className="secondary-button sound-unlock" onClick={() => setAudioBlocked(false)}>Ativar efeitos</button>}</section>
    </div>
    {mediaError && <p className="error-message voice-error">{mediaError}</p>}
  </div>;
}

function RemoteAudio({ stream, volume, onBlocked }) {
  const audioRef = useRef(null);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    audio.srcObject = stream;
    audio.volume = volume;
    audio.muted = false;
    console.info("[VOICE DEBUG] audio element", { volume: audio.volume, muted: audio.muted, tracks: stream.getAudioTracks().length });
    audio.play().catch((error) => { if (error.name !== "AbortError") { console.error("[VOICE DEBUG] audio.play failed", error); onBlocked(); } });
    return () => { audio.srcObject = null; };
  }, [stream, volume]);
  return <audio ref={audioRef} autoPlay playsInline />;
}
