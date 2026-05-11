function playTone(frequency: number, durationMs: number, type: OscillatorType) {
  if (typeof window === "undefined") return;

  const audioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!audioContextClass) return;

  const context = new audioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.value = 0.04;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + durationMs / 1000);
  oscillator.stop(context.currentTime + durationMs / 1000);
}

export function playCorrectSound() {
  playTone(660, 180, "triangle");
  window.setTimeout(() => playTone(880, 180, "triangle"), 90);
}

export function playTryAgainSound() {
  playTone(280, 220, "sine");
}