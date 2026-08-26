import { Camera, CameraOff, ChevronLeft, Maximize, Mic, MicOff, MonitorUp, PhoneOff, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCall } from "../contexts/CallContext";

function VideoTile({ stream, label, muted = false, featured = false }) {
  const videoRef = useRef(null);
  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, [stream]);
  return <div className={`video-tile ${featured ? "featured" : ""}`}><video ref={videoRef} autoPlay playsInline muted={muted} /><div className="video-label">{label}</div></div>;
}

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { localStream, screenStream, remoteStreams, participants, mediaError, enterCall, exitCall, toggleAudio, toggleVideo, shareScreen } = useCall();
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageRef = useRef(null);

  useEffect(() => { enterCall(roomId); return () => { exitCall(); }; }, [roomId]);

  async function leave() { await exitCall(); navigate("/"); }
  async function fullscreen() { if (!document.fullscreenElement) await stageRef.current?.requestFullscreen(); else await document.exitFullscreen(); setIsFullscreen(Boolean(document.fullscreenElement)); }

  return <main className="room-shell"><header className="room-topbar"><button className="back-button" onClick={leave}><ChevronLeft size={18} /> Voltar ao lobby</button><div className="room-title"><span className="live-dot" /> sala ao vivo <strong>#{roomId.slice(0, 6)}</strong></div><div className="participant-total"><Users size={16} /> {participants.length}</div></header><section className="call-layout"><div className="stage" ref={stageRef}>{screenStream ? <VideoTile stream={screenStream} label="Você · compartilhando tela" muted featured /> : <div className="stage-empty"><div className="stage-symbol"><RadioIcon /></div><h1>A sala está pronta.</h1><p>Ative sua câmera ou compartilhe sua tela para começar.</p></div>}<div className="self-preview">{localStream && <VideoTile stream={localStream} label="Você" muted />}</div><div className="fullscreen-control"><button className="icon-button" title="Tela cheia" onClick={fullscreen}><Maximize size={18} /></button></div></div><aside className="participants-panel"><div className="panel-heading"><span>Participantes</span><b>{participants.length}</b></div><div className="participant-grid">{Object.entries(remoteStreams).map(([uid, stream]) => <VideoTile key={uid} stream={stream} label={participants.find((item) => item.uid === uid)?.displayName ?? "Participante"} />)}{Object.keys(remoteStreams).length === 0 && <p className="participant-hint">Você está só por aqui.<br />Chame sua gang para entrar.</p>}</div></aside></section><footer className="call-controls"><button className={`control-button ${audioEnabled ? "" : "off"}`} onClick={() => setAudioEnabled(toggleAudio())} title="Microfone">{audioEnabled ? <Mic /> : <MicOff />}</button><button className={`control-button ${videoEnabled ? "" : "off"}`} onClick={() => setVideoEnabled(toggleVideo())} title="Câmera">{videoEnabled ? <Camera /> : <CameraOff />}</button><button className={`control-button screen-control ${screenStream ? "active" : ""}`} onClick={shareScreen} title="Compartilhar tela"><MonitorUp /><span>{screenStream ? "Parar compartilhamento" : "Compartilhar tela"}</span></button><button className="hangup-button" onClick={leave} title="Sair"><PhoneOff size={19} /></button></footer>{mediaError && <div className="toast error-message">{mediaError}</div>}{isFullscreen && <span className="sr-only">Tela cheia ativa</span>}</main>;
}

function RadioIcon() { return <span className="radio-glyph">◉</span>; }