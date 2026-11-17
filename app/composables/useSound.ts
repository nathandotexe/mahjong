/**
 * Tiny synthesised sound set (no audio assets). Everything is generated with WebAudio so the
 * game stays a single bundle. Mute state is remembered per device.
 */
type SoundName = 'click' | 'draw' | 'claim' | 'kong' | 'win' | 'tick' | 'alert' | 'shuffle'

let context: AudioContext | null = null

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!context) context = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (context.state === 'suspended') context.resume().catch(() => {})
    return context
  } catch {
    return null
  }
}

function tone(frequency: number, duration: number, options: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {}) {
  const audio = ctx()
  if (!audio) return
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  const start = audio.currentTime + (options.delay ?? 0)
  osc.type = options.type ?? 'sine'
  osc.frequency.setValueAtTime(frequency, start)
  if (options.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, frequency + options.slide), start + duration)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(options.gain ?? 0.12, start + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain).connect(audio.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

function noise(duration: number, gainValue = 0.08, delay = 0) {
  const audio = ctx()
  if (!audio) return
  const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * duration), audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const source = audio.createBufferSource()
  source.buffer = buffer
  const gain = audio.createGain()
  gain.gain.value = gainValue
  const filter = audio.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 1800
  source.connect(filter).connect(gain).connect(audio.destination)
  source.start(audio.currentTime + delay)
}

const PLAY: Record<SoundName, () => void> = {
  click: () => {
    noise(0.03, 0.12)
    tone(1800, 0.05, { type: 'triangle', gain: 0.05, slide: -900 })
  },
  draw: () => tone(660, 0.06, { type: 'triangle', gain: 0.05 }),
  claim: () => {
    tone(523, 0.1, { type: 'square', gain: 0.06 })
    tone(784, 0.14, { type: 'square', gain: 0.06, delay: 0.09 })
  },
  kong: () => {
    tone(392, 0.12, { type: 'sawtooth', gain: 0.05 })
    tone(587, 0.12, { type: 'sawtooth', gain: 0.05, delay: 0.1 })
    tone(880, 0.18, { type: 'sawtooth', gain: 0.05, delay: 0.2 })
  },
  win: () => {
    const notes = [523, 659, 784, 1046]
    notes.forEach((n, i) => tone(n, 0.22, { type: 'triangle', gain: 0.09, delay: i * 0.12 }))
    tone(1318, 0.5, { type: 'sine', gain: 0.07, delay: 0.5 })
  },
  tick: () => tone(1200, 0.04, { type: 'square', gain: 0.03 }),
  alert: () => {
    tone(880, 0.08, { type: 'square', gain: 0.05 })
    tone(880, 0.08, { type: 'square', gain: 0.05, delay: 0.14 })
  },
  shuffle: () => {
    for (let i = 0; i < 6; i++) noise(0.04, 0.05, i * 0.05)
  }
}

export const useSound = () => {
  const muted = useState<boolean>('sound-muted', () => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem('mj-muted') === '1'
    } catch {
      return false
    }
  })

  const play = (name: SoundName) => {
    if (muted.value) return
    try {
      PLAY[name]()
    } catch {
      /* audio not available */
    }
  }

  const toggle = () => {
    muted.value = !muted.value
    try {
      window.localStorage.setItem('mj-muted', muted.value ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (!muted.value) play('click')
  }

  return { muted, play, toggle }
}
