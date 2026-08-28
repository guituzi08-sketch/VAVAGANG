import { Maximize, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function ScreenShareViewer({ stream, label, muted = false, compact = false }) {
  const videoRef = useRef(null);
  const [volume, setVolume] = useState(muted ? 0 : 1);
  const [playbackError, setPlaybackError] = useState("");
  useEffect(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, [stream]);
  useEffect(() => { if (videoRef.current) videoRef.current.volume = volume; }, [volume]);
  async function playVideo() {
    if (!videoRef.current) return;
    try {
      await videoRef.current.play();
      setPlaybackError("");
    } catch (error) {
      if (error.name !== "AbortError") setPlaybackError("Clique para reproduzir o compartilhamento.");
    }
  }
  async function toggleFullscreen() {
    if (!videoRef.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (videoRef.current.requestFullscreen) await videoRef.current.requestFullscreen();
    } catch (error) {
      setPlaybackError(error.message || "Não foi possível abrir a tela cheia.");
    }
  }
  return <figure className={`screen-share-viewer ${compact ? "compact" : ""}`}><video ref={videoRef} autoPlay playsInline muted={muted} onLoadedMetadata={playVideo} onError={() => setPlaybackError("Não foi possível reproduzir a tela compartilhada.")} />{playbackError && <button className="screen-share-play" onClick={playVideo}>{playbackError}</button>}<figcaption><span>📺 {label}</span><div className="screen-share-controls"><button className="icon-button" onClick={() => setVolume((current) => current ? 0 : 1)} title={volume ? "Silenciar áudio da tela" : "Ativar áudio da tela"}>{volume ? <Volume2 size={15} /> : <VolumeX size={15} />}</button><button className="icon-button" onClick={toggleFullscreen} title="Tela cheia"><Maximize size={15} /></button></div></figcaption></figure>;
}
