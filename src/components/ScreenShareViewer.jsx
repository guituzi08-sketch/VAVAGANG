import { Maximize, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function ScreenShareViewer({ stream, label, muted = false, compact = false }) {
  const videoRef = useRef(null);
  const [volume, setVolume] = useState(muted ? 0 : 1);
  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, [stream]);
  useEffect(() => { if (videoRef.current) videoRef.current.volume = volume; }, [volume]);
  async function toggleFullscreen() {
    if (!videoRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (videoRef.current.requestFullscreen) await videoRef.current.requestFullscreen();
  }
  return <figure className={`screen-share-viewer ${compact ? "compact" : ""}`}><video ref={videoRef} autoPlay playsInline muted={muted} /><figcaption><span>📺 {label}</span><div className="screen-share-controls"><button className="icon-button" onClick={() => setVolume((current) => current ? 0 : 1)} title={volume ? "Silenciar áudio da tela" : "Ativar áudio da tela"}>{volume ? <Volume2 size={15} /> : <VolumeX size={15} />}</button><button className="icon-button" onClick={toggleFullscreen} title="Tela cheia"><Maximize size={15} /></button></div></figcaption></figure>;
}
