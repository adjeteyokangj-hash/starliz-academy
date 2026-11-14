import { resolveGuideVoice, voiceProfiles } from "./guideVoiceProfiles";
import type { Character } from "./guide";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const subscribe = () => () => {};
const speechAvailable = () => "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const serverSpeechAvailable = () => false;
const rates = { slow: .75, normal: .95, fast: 1.2 };
export type GuideSpeechSpeed = keyof typeof rates;

export function useGuideSpeech(text: string, enabled: boolean, voiceId?: string, speed: GuideSpeechSpeed = "normal", scope?: string, character: Character = "StarLiz Guide", accent?: string, expanded = true) {
  const available = useSyncExternalStore(subscribe, speechAvailable, serverSpeechAvailable);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const current = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!available) return;
    const synthesis = window.speechSynthesis;
    const discover = () => setVoices((synthesis.getVoices?.() ?? []).filter(voice => voice.localService && /^en(?:-|$)/i.test(voice.lang)));
    queueMicrotask(discover);
    synthesis.addEventListener?.("voiceschanged", discover);
    return () => synthesis.removeEventListener?.("voiceschanged", discover);
  }, [available]);

  const stop = useCallback(() => {
    if (!current.current) return;
    current.current = null;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const { voice, fallback } = resolveGuideVoice(voices, character, voiceId, accent);
  const profile = voiceProfiles[character];
  const speak = useCallback((copy: string) => {
    if (!available || !copy || document.hidden) return;
    stop();
    if (!voice) return;
    const utterance = new SpeechSynthesisUtterance(copy.replace(/\s+/g, " ").trim());
    utterance.voice = voice;
    utterance.lang = voice.lang;
    const { pitch, pace } = profile;
    utterance.pitch = pitch;
    utterance.rate = (rates[speed] ?? rates.normal) * pace;
    current.current = utterance;
    utterance.onstart = () => { if (current.current === utterance) setSpeaking(true); };
    utterance.onend = utterance.onerror = () => {
      if (current.current !== utterance) return;
      current.current = null;
      setSpeaking(false);
    };
    try { window.speechSynthesis.speak(utterance); } catch { stop(); }
  }, [available, profile, speed, stop, voice]);

  const latestSpeak = useRef(speak);
  useEffect(() => { latestSpeak.current = speak; }, [speak]);
  useEffect(() => {
    if (enabled && expanded && text) latestSpeak.current(text);
    return stop;
  }, [character, enabled, expanded, scope, stop, text, voice?.voiceURI]);

  useEffect(() => {
    const visibility = () => { if (document.hidden) stop(); };
    window.addEventListener("pagehide", stop);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", stop);
      document.removeEventListener("visibilitychange", visibility);
      stop();
    };
  }, [stop]);

  return { available, voices, voice, fallback, style: profile.style, speaking, stop, replay: () => speak(text), preview: () => speak("Hello! I’m your StarLiz coding guide. Let’s build something together.") };
}
