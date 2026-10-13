/**
 * Audio elements the browser refused to start (autoplay policy: no user
 * gesture yet — typical after accepting a call on a phone, or when a remote
 * audio track arrives seconds after joining). They are retried on the very
 * next tap or key press, so nobody is left in a silent call.
 */
const blocked = new Set<HTMLAudioElement>();
let armed = false;

function arm() {
  if (armed || typeof window === "undefined") return;
  armed = true;
  const events = ["pointerdown", "keydown", "touchend"] as const;
  const retry = () => {
    blocked.forEach((audio) => { void audio.play().then(() => blocked.delete(audio)).catch(() => undefined); });
    if (blocked.size === 0) {
      armed = false;
      events.forEach((name) => window.removeEventListener(name, retry, true));
    }
  };
  events.forEach((name) => window.addEventListener(name, retry, true));
}

/** play(), and if autoplay blocks it, try again on the next user gesture. */
export function playWithUnlock(audio: HTMLAudioElement) {
  if (!audio.paused) return;
  void audio.play().then(() => blocked.delete(audio)).catch((error: DOMException) => {
    if (error?.name === "NotAllowedError") { blocked.add(audio); arm(); }
  });
}

export function forgetAudio(audio: HTMLAudioElement | null) {
  if (audio) blocked.delete(audio);
}
