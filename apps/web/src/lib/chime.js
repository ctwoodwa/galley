/**
 * Phase F: short audible cue that fires when the player crosses an
 * edited-but-not-yet-rendered chunk. The user is listening to old audio
 * for a sentence they've already changed in text — the chime is the
 * "this isn't ship-ready yet, you queued an edit here" reminder.
 *
 * Web Audio API rather than an MP3 — zero asset weight, predictable
 * latency, and one shared AudioContext across the app session. The
 * envelope is ~250ms (660 Hz → 880 Hz, exp gain ramp) so it doesn't
 * trample dialogue.
 */

let ctx = null
function getCtx() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  // Some browsers suspend the context until a user gesture; resume on
  // first call. The chime is always triggered from a play loop, which
  // started with a play-button click, so this is safe.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

export function playStaleChime() {
  const ac = getCtx()
  if (!ac) return
  const t0 = ac.currentTime
  const gain = ac.createGain()
  gain.connect(ac.destination)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28)

  const osc = ac.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(660, t0)
  osc.frequency.linearRampToValueAtTime(880, t0 + 0.18)
  osc.connect(gain)
  osc.start(t0)
  osc.stop(t0 + 0.3)
}

const CHIME_ENABLED_KEY = 'galley.reader.chime-enabled'

export function isChimeEnabled() {
  try {
    const v = localStorage.getItem(CHIME_ENABLED_KEY)
    return v === null ? true : v === '1'
  } catch { return true }
}

export function setChimeEnabled(on) {
  try { localStorage.setItem(CHIME_ENABLED_KEY, on ? '1' : '0') } catch {}
}
