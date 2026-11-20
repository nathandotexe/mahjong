<template>
  <div class="mj-page guide">
    <div class="mj-card shell">
      <header class="head">
        <NuxtLink to="/" class="mj-btn ghost small">← Back</NuxtLink>
        <div>
          <h1 class="mj-title">How to Play</h1>
          <p class="mj-subtitle">Blood Battle: Sichuan mahjong, explained from the first tile to the final score.</p>
        </div>
      </header>

      <nav class="toc" aria-label="Sections">
        <a v-for="s in sections" :key="s.id" :href="`#${s.id}`" class="toc-link">{{ s.label }}</a>
      </nav>

      <!-- 1. Tiles -->
      <section id="tiles" class="block">
        <h2><span class="num">1</span> The tiles</h2>
        <p>
          Sichuan mahjong uses only <b>108 tiles</b>: three suits numbered 1 to 9, four copies of each.
          There are no winds, dragons or flowers.
        </p>
        <div class="suits">
          <div v-for="suit in suitRows" :key="suit.name" class="suit-row">
            <div class="suit-name"><b>{{ suit.name }}</b><small>{{ suit.alt }}</small></div>
            <div class="tiles"><MahjongTile v-for="t in suit.tiles" :key="t.id" :tile="t" size="xs" flat /></div>
          </div>
        </div>
        <p>
          A table seats 2 to 4 players. The host can fill empty seats with bots. Everyone gets 13 tiles,
          and the dealer gets a 14th and discards first.
        </p>
      </section>

      <!-- 2. Goal -->
      <section id="goal" class="block">
        <h2><span class="num">2</span> The goal: a winning hand</h2>
        <p>You win (<b>Hu</b>) when your 14 tiles form one of these shapes:</p>
        <div class="shape">
          <h3>Four sets + one pair</h3>
          <p>A <b>set</b> is a run of three in a row in one suit (a <i>chow</i>), three identical tiles (a <i>pung</i>), or four identical tiles (a <i>kong</i>). The <b>pair</b> is two identical tiles.</p>
          <div class="hand-example">
            <div v-for="(g, i) in exampleBasic" :key="i" class="group"><MahjongTile v-for="t in g" :key="t.id" :tile="t" size="xs" flat /></div>
          </div>
          <small class="caption">Runs 1-2-3, 4-5-6, 7-8-9 of characters, a pung of 5 dots, and a pair of 9 dots.</small>
        </div>
        <div class="shape">
          <h3>Seven pairs</h3>
          <p>Seven pairs, all held in your hand (nothing claimed from other players). Four identical tiles count as two pairs.</p>
          <div class="hand-example">
            <div v-for="(g, i) in exampleSevenPairs" :key="i" class="group"><MahjongTile v-for="t in g" :key="t.id" :tile="t" size="xs" flat /></div>
          </div>
        </div>
        <div class="callout warn">
          <b>The one-suit-missing rule.</b> Every winning hand uses <b>at most two suits</b>. Before play starts you
          declare one suit <i>void</i>, and you cannot win while any tile of that suit is still in your hand.
        </div>
      </section>

      <!-- 3. Flow -->
      <section id="flow" class="block">
        <h2><span class="num">3</span> How a hand plays out</h2>
        <ol class="steps">
          <li>
            <b>Swap three</b> <span class="mj-chip muted">optional</span>
            <p>Everyone picks three tiles of a single suit to pass. When all have chosen, the direction is revealed: to the next player, the previous player, or across the table. You have 30 seconds.</p>
          </li>
          <li>
            <b>Declare your void suit</b>
            <p>Choose the suit you will get rid of. Pick the one you hold fewest of. The game suggests one, and picks it for you after 30 seconds.</p>
          </li>
          <li>
            <b>Draw, then discard</b>
            <p>On your turn you draw a tile, then discard one. While you still hold void-suit tiles you <b>must discard those first</b>.</p>
          </li>
          <li>
            <b>Claim other players' discards</b>
            <p>When someone discards, you may claim it to complete a set or win:</p>
            <ul class="claims">
              <li><span class="mj-chip red">Win</span> the discard completes your hand. This beats every other claim, and several players can win on the same tile.</li>
              <li><span class="mj-chip gold">Kong</span> you hold three of that tile. Take it, then draw a replacement tile.</li>
              <li><span class="mj-chip green">Pung</span> you hold two of that tile. Take it, then discard.</li>
              <li><span class="mj-chip muted">Pass</span> let it go.</li>
            </ul>
            <p class="note">There is <b>no chow</b> in Sichuan mahjong: you cannot claim a discard to complete a run. Runs only come from your own draws.</p>
          </li>
          <li>
            <b>Kongs on your own turn</b>
            <p>Four identical tiles in your hand can be declared as a <b>concealed kong</b>. Drawing the fourth tile of a pung you already claimed lets you <b>add it</b> to make a kong. Either way you draw a replacement.</p>
          </li>
        </ol>
      </section>

      <!-- 4. Blood battle -->
      <section id="battle" class="block">
        <h2><span class="num">4</span> Blood Battle: the hand keeps going</h2>
        <p>
          A win does <b>not</b> end the hand. The winner collects their points and steps out, and the others keep
          playing for the remaining wins.
        </p>
        <p>The hand ends when:</p>
        <ul class="plain">
          <li>only one player is left who has not won, or</li>
          <li>the wall runs out of tiles (a <b>draw</b>, settled with the penalties below).</li>
        </ul>
        <div class="callout">
          <b>Blood River</b> <span class="mj-chip muted">host option</span><br>
          Winners stay in and can win again and again until the wall is empty. After a win your hand is locked: you
          can only discard the tile you just drew, or win again.
        </div>
        <p>The first player to win becomes the dealer for the next hand.</p>
      </section>

      <!-- 5. Scoring -->
      <section id="scoring" class="block">
        <h2><span class="num">5</span> Scoring</h2>
        <p>
          Hands are valued in <b>fan</b>. Each fan doubles the payment:
          <b>points = base × 2<sup>fan</sup></b>, up to the table's fan cap (4 by default).
        </p>
        <div class="fan-scale">
          <div v-for="f in [0, 1, 2, 3, 4]" :key="f" class="fan-step"><b>{{ f }} fan</b><span>{{ 2 ** f }} pt{{ f ? 's' : '' }}</span></div>
        </div>

        <h3>Who pays</h3>
        <ul class="plain">
          <li><b>Win on a discard:</b> only the player who discarded it pays.</li>
          <li><b>Self-draw win</b> (you drew the winning tile): every player still in the hand pays. This adds +1 fan on the Standard table, or +1 base point on the MIL table.</li>
        </ul>

        <div class="preset-tabs" role="tablist">
          <button v-for="p in presets" :key="p.key" role="tab" class="mj-btn small" :class="{ primary: preset === p.key }" :aria-selected="preset === p.key" @click="preset = p.key">{{ p.label }}</button>
        </div>
        <p class="note">{{ presets.find(p => p.key === preset)!.blurb }}</p>

        <table class="fan-table">
          <thead><tr><th>Hand</th><th>What it is</th><th class="r">Fan</th></tr></thead>
          <tbody>
            <tr v-for="row in fanRows" :key="row.name"><td><b>{{ row.name }}</b></td><td>{{ row.desc }}</td><td class="r">{{ row.fan }}</td></tr>
          </tbody>
        </table>
        <p class="note"><b>Pure</b> means the whole hand is a single suit.</p>

        <h3>Bonus fan (added on top)</h3>
        <table class="fan-table">
          <tbody>
            <tr v-for="row in bonusRows" :key="row.name"><td><b>{{ row.name }}</b></td><td>{{ row.desc }}</td><td class="r">{{ row.fan }}</td></tr>
          </tbody>
        </table>

        <h3>Kong payments (paid immediately)</h3>
        <table class="fan-table">
          <tbody>
            <tr><td><b>Exposed kong</b></td><td>Claimed from a discard: the discarder pays</td><td class="r">2</td></tr>
            <tr><td><b>Concealed kong</b></td><td>Four of a kind from your own draws: every active player pays</td><td class="r">2 each</td></tr>
            <tr><td><b>Added kong</b></td><td>Fourth tile added to your pung: every active player pays</td><td class="r">1 each</td></tr>
          </tbody>
        </table>
        <p class="note">Kong values are in base points, not fan.</p>
      </section>

      <!-- 6. Draw -->
      <section id="draw" class="block">
        <h2><span class="num">6</span> When the wall runs out</h2>
        <p>If two or more players have not won when the last tile is gone, the hand is settled among them:</p>
        <ul class="plain">
          <li><b>Flower pig:</b> a player still holding all three suits (or any void-suit tile) pays {{ preset === 'mil' ? '16 points' : 'the maximum (cap) value' }} to every other non-winner who is not also a flower pig.</li>
          <li><b>Not ready:</b> a player who is not one tile from winning pays each ready player as if that player had won with their best possible hand.</li>
          <li><b>Kong refund:</b> players who were not ready give back everything they earned from kongs this hand.</li>
        </ul>
        <div class="callout">Players who already won are not involved, and keep everything they earned.</div>
      </section>

      <!-- 7. Special rules -->
      <section id="special" class="block">
        <h2><span class="num">7</span> Special rules</h2>
        <dl class="defs">
          <dt>Passed win lock <span class="mj-chip muted">host option</span></dt>
          <dd>If you pass on a discard you could have won on, you cannot win on that same tile from a discard until your next draw. The exception is a higher-scoring hand.</dd>
          <dt>Robbing the kong</dt>
          <dd>When someone adds a tile to a pung to make a kong, anyone who could win on that tile may take it instead. The kong is cancelled and the robber wins with +1 fan.</dd>
          <dt>Kong transfer <span class="mj-chip muted">host option</span></dt>
          <dd>If you make a kong and someone wins on the discard right after your replacement draw, your kong income goes to the winner.</dd>
          <dt>Heavenly and Earthly hands <span class="mj-chip muted">Standard table</span></dt>
          <dd>The dealer winning on the dealt tiles, or another player winning on their very first draw before anyone has claimed, scores the fan cap.</dd>
        </dl>
      </section>

      <!-- 8. Timers -->
      <section id="timers" class="block">
        <h2><span class="num">8</span> Timers and auto-play</h2>
        <ul class="plain">
          <li>You have <b>20 seconds</b> per turn and <b>8 seconds</b> to answer a claim. The host can change both, or turn them off.</li>
          <li>If your turn timer runs out, <b>auto-play</b> takes your seat: it discards for you, takes any win it can, and passes everything else.</li>
          <li>Auto-play also takes over if you lose your connection for more than 45 seconds. Reconnecting gives your seat back automatically.</li>
          <li>Press <b>I'm back</b> in the banner above your hand to take control again at any time.</li>
        </ul>
      </section>

      <!-- 9. Tips -->
      <section id="tips" class="block">
        <h2><span class="num">9</span> Quick tips for new players</h2>
        <ul class="plain">
          <li>Void the suit you hold fewest of, and throw those tiles away first.</li>
          <li>Pungs are easy to collect, because you can claim them from discards. All Pungs is a solid +1 fan.</li>
          <li>Going for a single suit (Full Flush, +2 fan) quadruples your win but takes longer.</li>
          <li>Once you are one tile from winning, a <b>READY</b> helper above your hand shows which tiles you are waiting on, how many are left, and their fan.</li>
          <li>Late in the hand, make sure you are ready to win. Being caught not ready at a draw costs points.</li>
        </ul>
        <NuxtLink to="/" class="mj-btn primary">Start playing</NuxtLink>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { TileSuit, type Tile } from '~/types/game'

useHead({ title: 'How to play · Blood on Mahjong' })

const SUIT_BY_LETTER: Record<string, TileSuit> = { m: TileSuit.CHARACTERS, p: TileSuit.DOTS, s: TileSuit.BAMBOOS }
let seq = 0
/** "123m 555p" -> groups of tiles, using the same notation as the engine tests. */
const groups = (notation: string): Tile[][] =>
  notation.split(' ').map(group => {
    const suit = SUIT_BY_LETTER[group.slice(-1)]!
    return [...group.slice(0, -1)].map(d => ({ suit, value: Number(d), id: `g${seq++}` }))
  })

const sections = [
  { id: 'tiles', label: 'Tiles' },
  { id: 'goal', label: 'Winning hand' },
  { id: 'flow', label: 'Turn flow' },
  { id: 'battle', label: 'Blood Battle' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'draw', label: 'Draws' },
  { id: 'special', label: 'Special rules' },
  { id: 'timers', label: 'Timers' },
  { id: 'tips', label: 'Tips' }
]

const suitRows = [
  { name: 'Characters', alt: 'wan', tiles: groups('123456789m')[0]! },
  { name: 'Dots', alt: 'tong', tiles: groups('123456789p')[0]! },
  { name: 'Bamboo', alt: 'tiao', tiles: groups('123456789s')[0]! }
]

const exampleBasic = groups('123m 456m 789m 555p 99p')
const exampleSevenPairs = groups('11m 33m 77m 22p 55p 66p 88p')

type Preset = 'standard' | 'mil'
const preset = ref<Preset>('standard')
const presets: { key: Preset; label: string; blurb: string }[] = [
  { key: 'standard', label: 'Standard table', blurb: 'The default for new tables. Fan cap 4, self-draw +1 fan, swap three on.' },
  { key: 'mil', label: 'MIL 2017 rules', blurb: 'Sichuan Bloody Rules (MIL 2017). Fan cap 3, self-draw +1 base point, no swap three, flower pig pays 16.' }
]

interface FanRow { name: string; desc: string; fan: number | string }
const STANDARD_FAN: FanRow[] = [
  { name: 'Basic Win', desc: 'Any four sets + pair', fan: 0 },
  { name: 'All Pungs', desc: 'Every set is a pung or kong', fan: 1 },
  { name: 'Full Flush', desc: 'Whole hand in one suit', fan: 2 },
  { name: 'Seven Pairs', desc: 'Seven pairs, nothing claimed', fan: 2 },
  { name: 'Dragon Seven Pairs', desc: 'Seven Pairs that include four identical tiles (each also scores a Root)', fan: 2 },
  { name: 'All Terminals', desc: 'Every set and the pair contain a 1 or 9', fan: 2 },
  { name: 'Golden Hook', desc: 'Four sets claimed or declared, winning on the single tile for the pair', fan: 2 },
  { name: 'Four Kongs', desc: 'Four kongs + a pair', fan: 2 },
  { name: '2-5-8 Pungs', desc: 'All pungs, every tile a 2, 5 or 8', fan: 3 },
  { name: 'Terminal Pungs', desc: 'All pungs, each containing a 1 or 9', fan: 3 },
  { name: 'Pure Pungs', desc: 'All Pungs + Full Flush', fan: 3 },
  { name: 'Pure Seven Pairs', desc: 'Seven Pairs + Full Flush', fan: 4 },
  { name: 'Pure Dragon Seven Pairs', desc: 'Dragon Seven Pairs + Full Flush', fan: 4 },
  { name: 'Pure Terminals', desc: 'All Terminals + Full Flush', fan: 4 },
  { name: 'Pure Golden Hook', desc: 'Golden Hook + Full Flush', fan: 4 },
  { name: 'Pure Four Kongs', desc: 'Four Kongs + Full Flush', fan: 4 },
  { name: 'Pure 2-5-8 / Terminal Pungs', desc: 'Those pung hands in a single suit', fan: 5 }
]
const MIL_FAN: FanRow[] = [
  { name: 'Basic Win', desc: 'Any four sets + pair', fan: 0 },
  { name: 'All Pungs', desc: 'Every set is a pung or kong', fan: 1 },
  { name: 'Full Flush', desc: 'Whole hand in one suit', fan: 2 },
  { name: 'Seven Pairs', desc: 'Seven pairs, nothing claimed', fan: 2 },
  { name: 'Golden Single Wait', desc: 'Four sets claimed or declared, winning on the single tile for the pair', fan: 2 },
  { name: 'Pure Pungs', desc: 'All Pungs + Full Flush', fan: 3 },
  { name: 'Pure Seven Pairs', desc: 'Seven Pairs + Full Flush', fan: 4 },
  { name: 'Pure Golden Single Wait', desc: 'Golden Single Wait + Full Flush', fan: 4 }
]
const fanRows = computed(() => (preset.value === 'mil' ? MIL_FAN : STANDARD_FAN))

const bonusRows = computed<FanRow[]>(() => [
  { name: 'Root', desc: 'Each group of four identical tiles in your hand or melds (including kongs)', fan: '+1 each' },
  ...(preset.value === 'standard' ? [{ name: 'Self-draw', desc: 'You drew the winning tile yourself', fan: '+1' }] : []),
  { name: 'Win after Kong', desc: 'Winning on the replacement tile after a kong', fan: '+1' },
  { name: 'Shoot after Kong', desc: 'Winning on the discard someone made right after their kong', fan: '+1' },
  { name: 'Robbing the Kong', desc: 'Winning on the tile someone tried to add to a pung', fan: '+1' },
  { name: 'Under the Sea', desc: 'Winning on the very last tile of the wall', fan: '+1' },
  ...(preset.value === 'standard' ? [{ name: 'Heavenly / Earthly Hand', desc: 'Winning on the deal, or on your first draw', fan: 'to cap' }] : [])
])
</script>

<style scoped>
.guide { padding-bottom: 48px; }
.shell { max-width: 820px; display: flex; flex-direction: column; gap: 8px; }
.head { display: flex; gap: 12px; align-items: flex-start; }
.head .mj-btn { flex-shrink: 0; margin-top: 4px; }

.toc { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 0 14px; border-bottom: 1px solid var(--panel-border); position: sticky; top: 0; z-index: 2; background: var(--panel-solid); margin: 0 -24px; padding-left: 24px; padding-right: 24px; }
.toc-link { font-size: 0.8rem; color: var(--ink-dim); text-decoration: none; padding: 4px 10px; border-radius: 999px; background: rgba(255, 255, 255, 0.06); }
.toc-link:hover { color: var(--ink); background: rgba(255, 255, 255, 0.12); }

.block { padding: 18px 0 8px; scroll-margin-top: 64px; border-bottom: 1px solid var(--panel-border); }
.block:last-child { border-bottom: 0; }
h2 { font-size: 1.15rem; margin: 0 0 10px; display: flex; align-items: center; gap: 10px; }
h3 { font-size: 0.95rem; margin: 18px 0 8px; color: var(--gold); }
p { line-height: 1.55; margin: 0 0 10px; color: var(--ink); }
.num { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--accent-deep); color: #fff; font-size: 0.85rem; flex-shrink: 0; }
.note { color: var(--ink-dim); font-size: 0.86rem; }
.caption { display: block; color: var(--ink-faint); margin-top: 6px; }

.suits { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
.suit-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.suit-name { width: 92px; display: flex; flex-direction: column; }
.suit-name small { color: var(--ink-faint); }
.tiles, .group { display: flex; gap: 2px; }
.tiles { flex-wrap: wrap; }

.shape { background: rgba(255, 255, 255, 0.04); border: 1px solid var(--panel-border); border-radius: 14px; padding: 12px 14px; margin: 10px 0; }
.shape h3 { margin-top: 0; }
.hand-example { display: flex; flex-wrap: wrap; gap: 10px; }

.callout { background: rgba(70, 197, 116, 0.1); border: 1px solid rgba(70, 197, 116, 0.35); border-radius: 12px; padding: 10px 14px; margin: 12px 0; font-size: 0.9rem; line-height: 1.5; }
.callout.warn { background: rgba(233, 196, 106, 0.1); border-color: rgba(233, 196, 106, 0.4); }

.steps { padding-left: 20px; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.steps > li::marker { color: var(--gold); font-weight: 700; }
.steps p { margin: 4px 0 0; color: var(--ink-dim); }
.claims { list-style: none; padding: 0; margin: 8px 0; display: flex; flex-direction: column; gap: 6px; color: var(--ink-dim); font-size: 0.9rem; }
.plain { padding-left: 20px; margin: 0 0 10px; display: flex; flex-direction: column; gap: 6px; line-height: 1.5; }

.fan-scale { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; margin: 10px 0 4px; }
.fan-step { display: flex; flex-direction: column; align-items: center; padding: 8px 4px; border-radius: 10px; background: rgba(255, 255, 255, 0.05); font-size: 0.85rem; }
.fan-step span { color: var(--gold); font-weight: 700; }

.preset-tabs { display: flex; gap: 6px; margin: 16px 0 6px; flex-wrap: wrap; }
.fan-table { width: 100%; border-collapse: collapse; font-size: 0.86rem; margin-bottom: 6px; }
.fan-table th { text-align: left; color: var(--ink-faint); font-weight: 600; padding: 6px 8px; border-bottom: 1px solid var(--panel-border); }
.fan-table td { padding: 7px 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); vertical-align: top; color: var(--ink-dim); }
.fan-table td b { color: var(--ink); }
.fan-table .r { text-align: right; white-space: nowrap; color: var(--gold); font-weight: 700; }

.defs { margin: 0; }
.defs dt { font-weight: 700; margin-top: 12px; }
.defs dd { margin: 4px 0 0; color: var(--ink-dim); line-height: 1.5; }

@media (max-width: 560px) {
  .mj-card.shell { padding: 18px 16px; }
  .toc { margin: 0 -16px; padding-left: 16px; padding-right: 16px; }
  .fan-table td:nth-child(2) { font-size: 0.8rem; }
  .suit-name { width: auto; flex-direction: row; gap: 6px; align-items: baseline; }
}
</style>
