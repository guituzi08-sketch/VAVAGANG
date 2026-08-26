import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { subscribeToSoundEffectEvents, subscribeToSoundEffects, triggerSoundEffect, uploadSoundEffect } from "../services/soundEffectService";

const SoundEffectsContext = createContext(null);

export function SoundEffectsProvider({ children }) {
  const { firebaseUser } = useAuth();
  const [effects, setEffects] = useState([]);
  const [error, setError] = useState("");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const audioCache = useRef(new Map());
  const effectsRef = useRef([]);

  useEffect(() => { effectsRef.current = effects; }, [effects]);

  function play(effect) {
    let audio = audioCache.current.get(effect.id);
    if (!audio) {
      audio = new Audio(effect.publicUrl);
      audio.preload = "auto";
      audioCache.current.set(effect.id, audio);
    }
    audio.currentTime = 0;
    audio.play().catch((playError) => {
      if (playError.name !== "AbortError") setAudioBlocked(true);
    });
  }

  function useRoomSoundEffects(roomId) {
    const [roomError, setRoomError] = useState("");
    useEffect(() => {
      if (!firebaseUser || !roomId) return undefined;
      const onError = (listenerError) => { setRoomError(listenerError.message); setError(listenerError.message); };
      const unsubscribeEffects = subscribeToSoundEffects(roomId, setEffects, onError);
      const unsubscribeEvents = subscribeToSoundEffectEvents(roomId, (events) => {
        events.forEach((event) => {
          if (event.triggeredBy === firebaseUser.uid) return;
          const effect = effectsRef.current.find((item) => item.id === event.effectId);
          if (effect) play(effect);
        });
      }, onError);
      return () => { unsubscribeEffects(); unsubscribeEvents(); };
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

    return { effects, error: roomError || error, audioBlocked, setAudioBlocked, trigger, upload };
  }

  return <SoundEffectsContext.Provider value={{ useRoomSoundEffects }}>{children}</SoundEffectsContext.Provider>;
}

export function useSoundEffects(roomId) {
  const context = useContext(SoundEffectsContext);
  if (!context) throw new Error("useSoundEffects deve ser usado dentro de SoundEffectsProvider.");
  return context.useRoomSoundEffects(roomId);
}