import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { removeSoundEffect, subscribeToSoundEffectEvents, subscribeToSoundEffects, triggerSoundEffect, uploadSoundEffect } from "../services/soundEffectService";

const SoundEffectsContext = createContext(null);

export function SoundEffectsProvider({ children }) {
  const { firebaseUser } = useAuth();
  const [effects, setEffects] = useState([]);
  const [error, setError] = useState("");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const audioCache = useRef(new Map());
  const effectsRef = useRef([]);
  const pendingEventsRef = useRef([]);

  useEffect(() => {
    effectsRef.current = effects;
    const pendingEvents = pendingEventsRef.current;
    pendingEventsRef.current = [];
    pendingEvents.forEach((event) => {
      const effect = effects.find((item) => item.id === event.effectId);
      if (effect) play(effect);
    });
  }, [effects]);

  function play(effect) {
    if (!effect?.publicUrl) {
      setError("Este efeito não possui uma URL de áudio válida.");
      return;
    }
    let audio = audioCache.current.get(effect.id);
    if (!audio) {
      audio = new Audio(effect.publicUrl);
      audio.preload = "auto";
      audio.addEventListener("error", () => setError(`Não foi possível carregar o áudio \"${effect.name}\".`));
      audioCache.current.set(effect.id, audio);
    }
    audio.currentTime = 0;
    audio.load();
    audio.play().catch((playError) => {
      if (playError.name !== "AbortError") {
        setAudioBlocked(true);
        setError("O navegador bloqueou a reprodução. Clique novamente no pad para ativar o áudio.");
      }
    });
  }

  function useRoomSoundEffects(roomId) {
    const [roomError, setRoomError] = useState("");
    useEffect(() => {
      if (!firebaseUser || !roomId) return undefined;
      pendingEventsRef.current = [];
      const onError = (listenerError) => { setRoomError(listenerError.message); setError(listenerError.message); };
      const unsubscribeEffects = subscribeToSoundEffects(roomId, setEffects, onError);
      const unsubscribeEvents = subscribeToSoundEffectEvents(roomId, (events) => {
        events.forEach((event) => {
          if (event.triggeredBy === firebaseUser.uid) return;
          const effect = effectsRef.current.find((item) => item.id === event.effectId);
          if (effect) play(effect);
          else pendingEventsRef.current.push(event);
        });
      }, onError);
      return () => { pendingEventsRef.current = []; unsubscribeEffects(); unsubscribeEvents(); };
    }, [firebaseUser, roomId]);

    async function trigger(roomEffect) {
      setError("");
      play(roomEffect);
      try { await triggerSoundEffect(roomId, firebaseUser, roomEffect.id); } catch (triggerError) { setError(triggerError.message); }
    }

    async function upload(file, name) {
      setError("");
      try {
        await uploadSoundEffect(roomId, firebaseUser, file, name);
      } catch (uploadError) {
        setError(uploadError.message);
        throw uploadError;
      }
    }

    async function remove(effect) {
      setError("");
      try {
        await removeSoundEffect(roomId, effect);
        audioCache.current.delete(effect.id);
      } catch (removeError) {
        setError(removeError.message);
        throw removeError;
      }
    }

    return { effects, error: roomError || error, audioBlocked, setAudioBlocked, trigger, upload, remove };
  }

  return <SoundEffectsContext.Provider value={{ useRoomSoundEffects }}>{children}</SoundEffectsContext.Provider>;
}

export function useSoundEffects(roomId) {
  const context = useContext(SoundEffectsContext);
  if (!context) throw new Error("useSoundEffects deve ser usado dentro de SoundEffectsProvider.");
  return context.useRoomSoundEffects(roomId);
}