<template>
  <div
    v-if="visible"
    class="intro"
    :class="{ 'intro--leaving': leaving }"
    role="presentation"
    aria-hidden="true"
    @click="skip"
  >
    <div class="intro-glow" />
    <div class="intro-content">
      <div class="intro-tiles">
        <div v-for="(tile, i) in tiles" :key="tile.id" class="intro-tile" :style="{ '--i': i }">
          <MahjongTile :tile="tile" size="lg" />
        </div>
      </div>
      <h1 class="intro-title">Blood on Mahjong</h1>
      <p class="intro-credit">
        <span class="intro-made">made by</span>
        <span class="intro-name">Livyera</span>
      </p>
      <span class="intro-line" />
    </div>
    <span class="intro-skip">tap to skip</span>
  </div>
</template>

<script setup lang="ts">
import { TileSuit, type Tile } from '~/types/game'

/**
 * Intro animation shown on the first load of each browser tab.
 * The overlay is rendered on the server so it covers the page from the very first paint;
 * a tiny head script hides it immediately when this tab has already seen it.
 * If JavaScript never runs, the CSS animation still fades it out on its own.
 */
const SEEN_KEY = 'mj-intro-seen'
const DURATION_MS = 2900
const REDUCED_DURATION_MS = 1200
const LEAVE_MS = 450

const tiles: Tile[] = [
  { suit: TileSuit.CHARACTERS, value: 1, id: 'intro-1' },
  { suit: TileSuit.DOTS, value: 5, id: 'intro-2' },
  { suit: TileSuit.BAMBOOS, value: 9, id: 'intro-3' }
]

const visible = ref(true)
const leaving = ref(false)
let timers: ReturnType<typeof setTimeout>[] = []

useHead({
  script: [
    {
      key: 'intro-seen',
      tagPosition: 'head',
      innerHTML: `try{if(sessionStorage.getItem('${SEEN_KEY}'))document.documentElement.setAttribute('data-intro-seen','')}catch(e){}`
    }
  ]
})

const remove = () => {
  visible.value = false
  timers.forEach(clearTimeout)
  timers = []
}

const leave = () => {
  if (leaving.value) return
  leaving.value = true
  timers.push(setTimeout(remove, LEAVE_MS))
}

const skip = () => leave()

onMounted(() => {
  let seen = false
  try {
    seen = !!window.sessionStorage.getItem(SEEN_KEY)
    window.sessionStorage.setItem(SEEN_KEY, '1')
  } catch {
    /* storage blocked: just play it */
  }
  if (seen) {
    remove()
    return
  }
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  timers.push(setTimeout(leave, reduced ? REDUCED_DURATION_MS : DURATION_MS))
})

onUnmounted(() => timers.forEach(clearTimeout))
</script>

<style scoped>
.intro {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
  background: radial-gradient(ellipse at 50% 45%, #1d6a46 0%, #0b2a1d 45%, var(--bg) 100%);
  /* Safety net: fades out by itself even if the app never hydrates. */
  animation: intro-out 0.45s ease 3.4s forwards;
}
.intro--leaving {
  animation: intro-out 0.45s ease forwards;
}

.intro-glow {
  position: absolute;
  width: 70vmin;
  height: 70vmin;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(233, 196, 106, 0.22), transparent 65%);
  animation: intro-glow 2.4s ease-out both;
}

.intro-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 16px;
  text-align: center;
}

.intro-tiles {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
  --tile-w: clamp(46px, 11vw, 64px);
  --tile-h: calc(var(--tile-w) * 1.42);
  perspective: 600px;
  pointer-events: none; /* tiles are disabled buttons; let taps reach the overlay to skip */
}
.intro-tile {
  opacity: 0;
  animation: intro-tile 0.7s cubic-bezier(0.2, 0.9, 0.3, 1.25) forwards;
  animation-delay: calc(var(--i) * 0.14s + 0.1s);
}
.intro-tile:nth-child(1) { --rot: -9deg; }
.intro-tile:nth-child(2) { --rot: 0deg; --lift: -8px; }
.intro-tile:nth-child(3) { --rot: 9deg; }

.intro-title {
  margin: 0;
  font-size: clamp(1.7rem, 6vw, 2.8rem);
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--ink);
  text-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
  opacity: 0;
  animation: intro-rise 0.6s ease 0.6s forwards;
}

.intro-credit {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 10px;
  opacity: 0;
  animation: intro-credit 0.9s ease 1.05s forwards;
}
.intro-made {
  font-size: clamp(0.8rem, 2.6vw, 1rem);
  text-transform: uppercase;
  letter-spacing: 0.32em;
  color: var(--ink-dim);
}
.intro-name {
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-weight: 700;
  font-size: clamp(1.6rem, 6vw, 2.4rem);
  background: linear-gradient(100deg, var(--gold-deep) 0%, var(--gold) 35%, #fff4cf 50%, var(--gold) 65%, var(--gold-deep) 100%);
  background-size: 250% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: intro-shimmer 1.6s ease 1.3s both;
}

.intro-line {
  width: 0;
  height: 2px;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, var(--gold), transparent);
  animation: intro-line 0.8s ease 1.4s forwards;
}

.intro-skip {
  position: absolute;
  bottom: 24px;
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
  opacity: 0;
  animation: intro-rise 0.4s ease 1.6s forwards;
}

@keyframes intro-tile {
  0% { opacity: 0; transform: translateY(-70px) rotateY(90deg) rotate(calc(var(--rot) * 3)); }
  60% { opacity: 1; }
  100% { opacity: 1; transform: translateY(var(--lift, 0)) rotateY(0) rotate(var(--rot)); }
}
@keyframes intro-rise {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes intro-credit {
  from { opacity: 0; letter-spacing: 0.3em; transform: translateY(8px); }
  to { opacity: 1; letter-spacing: normal; transform: translateY(0); }
}
@keyframes intro-shimmer {
  from { background-position: 100% 0; }
  to { background-position: 0% 0; }
}
@keyframes intro-line {
  to { width: min(260px, 60vw); }
}
@keyframes intro-glow {
  from { transform: scale(0.4); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes intro-out {
  to { opacity: 0; visibility: hidden; pointer-events: none; }
}

/* Reduced motion: no movement, just a quick fade (main.css also shortens animations). */
@media (prefers-reduced-motion: reduce) {
  .intro-tile, .intro-title, .intro-credit, .intro-skip { opacity: 1; animation: none; }
  .intro-line { width: min(260px, 60vw); animation: none; }
  .intro-name { animation: none; background-position: 50% 0; }
  .intro { animation: intro-out 0.3s ease 1.4s forwards; }
}
</style>
