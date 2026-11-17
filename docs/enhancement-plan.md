# Blood on Mahjong — UI / UX / Mechanism Enhancement Plan

Date: 2026-11-10

## Status (2026-11-11)

Done:
- Phase 0: in-memory DB fallback (`server/utils/memoryDb.ts`), `.env.example`, Vitest, dev account seeding.
- Phase 1: new pure engine in `server/engine/` covering every rule in section 6 and 7, ledger scoring,
  timers with auto-play, multi-hand sessions. 97 unit tests including 120 randomised full hands.
- Phase 2: room codes, `/join/CODE`, guest login, seat bound to the session cookie, reconnect grace,
  invite panel with QR and share, bot seats. Legacy `rooms` API and services removed.
- Phase 3: redesigned lobby, waiting room, table, SVG tiles, HUD, action bar, chat, scoreboard, history.
- Phase 4: tile motion, pung/kong/win stamps, score pop-ups, staged result reveal, synthesised sounds with mute.
- Phase 5: Playwright test where two browsers and two bots play a full hand; README rewritten.

Known limits / follow-ups:
- `nuxt dev` crashes on a Socket.IO WebSocket upgrade, so the client stays on HTTP polling in dev only.
  Production upgrades to WebSocket as before; worth confirming once on the real cluster.
- Bots play a simple heuristic (discard isolated tiles, always take a win); they never peng or kong.
- `postman_collection.json` and `test-crud.http` still describe the old endpoints.
- Docker / Helm were not rebuilt; no new runtime dependency besides `qrcode` (client only).

## 1. Current state (what the analysis found)

Stack: Nuxt 4 + Vue 3 + Nuxt UI, Nitro server, Socket.IO (Redis adapter optional), MongoDB.
Engine lives in `server/utils/gameManager.ts` (in-memory singleton, persisted to Mongo).
Rules in `server/utils/handValidator.ts` and `server/utils/scoring.ts`. Main table UI is
`app/pages/gameroom/[roomId].vue` (1,100 lines) plus three tile/seat components.

### Mechanism bugs and rule gaps (ordered by severity)

1. **Every action executes twice.** `useGame.executeAction` emits `game:action` over the socket
   AND POSTs `/api/game/action`; both paths call `gameManager.executeAction`. A duplicated PASS
   advances the turn twice (two players draw), a duplicated HU double-counts the winner.
2. **Host page refresh kills the game.** On socket `disconnect`, `handleLeaveRoom` treats the
   owner as having left and dismisses the room for everyone. No reconnect grace period.
3. **Claim priority is not resolved.** When a discard gives player A "Peng" and player B "Hu",
   whoever clicks first wins; a Peng wipes B's pending Hu. Hu must beat Kong must beat Peng.
4. **Pending claims never expire.** `expiresAt` (30 s) is set but never enforced; no turn timer.
   One idle player stalls the table forever.
5. **Kong points are not zero-sum.** Direct kong credits the kong player +2 but never debits the
   discarder; concealed/extended kong credit n×2 / n×1 but debit nobody.
6. **Win payment ignores who dealt the winning tile.** Every non-winner pays each winner. In
   Blood Battle a discard win is paid by the discarder only; a self-draw is paid by all
   and earns +1 fan. Discarder is not tracked.
7. **Missing-suit (void suit) is never declared.** It is inferred after discards; `canWin` does not
   reject hands that still hold the "missing" suit; flower-pig and 1-fan base assume it.
8. **Fan breakdown is thrown away.** `calculateFan` returns names (Full Flush, All Pungs, roots …) but
   only `wonFan` is stored; players never see why they scored what they scored.
9. Kong-flower (win after kong), kong-discard (shoot after kong), robbing-the-kong (robbing the kong) are flags that are always
   false. Ting status is only recomputed on discard, not after Peng/Kong.
10. `handleHu` mutates state (WON, winnersCount++) before validating the hand; a rejected Hu
    leaves corrupt in-memory state. `handleDiscard` records `tile` after removing it (always
    undefined in history).
11. One game = one hand. No "next round" with dealer rotation, no cumulative session scoreboard.
12. Identity is not bound to a seat. `/api/game/action` and `/api/game/state` accept any
    `playerId`; the seat id travels in the URL (`?playerId=`), so sharing the room link shares
    your hand. Auth middleware only checks that a cookie exists.
13. Three overlapping room models: `gameManager` games (used by UI), `RoomService`/`rooms`
    collection (unused), and `roomStates` in socket.ts. Room id is a UUID (unshareable verbally).

### UI / UX gaps

- Tiles are text-only (digit + characters/dots/bamboo); at ≤1300 px they shrink to 25×30 px and at ≤900 px to
  20×25 px (unreadable). Mobile portrait is handled by rotating the whole page 90° in CSS.
- No animations: no draw/discard motion, no pung/kong/win call-outs, no turn-change cue, no result
  reveal. No sound.
- Information not shown: remaining wall count (already broadcast), each player's missing suit,
  ting indicator, last discard highlight, running scores, kong points as they happen, turn timer.
- Action buttons live in a side panel; on mobile users must scroll ("Action available — scroll
  down for buttons").
- Game-over overlay shows rank + total only; no fan breakdown, no "Play again".
- Chat exists on the server (`chat:message`) but has no UI.
- Lobby hint still says "New Game will temporarily send you to room #66666". Login page is a list
  of DB users (dev mode) — confusing for an invited friend.

### Shareability gaps

- No short room code, no copy-invite button, no `/join/CODE` route, no QR code.
- No guest path: an invited friend must have a DB user or Google account.
- A guest cannot rejoin after refresh (new `playerId` each join).

### Tooling

- Only one recorded Playwright smoke test; zero unit tests on the engine.
- `npm run setup` points at a missing `server/utils/setupMongo.ts`.
- No `node_modules`, no `.env`; MongoDB is required for everything including login. Docker is
  installed but not running.

## 2. Goals

1. A friend can open one link (or type a 6-char code), pick a nickname, and be seated in under 30 s.
2. The table is readable and playable on phone and desktop without rotating the page.
3. Rules are correct and zero-sum; players can see exactly how every point was earned.
4. The game feels alive: tiles move, claims are announced, turns are timed, results animate.
5. A session can run several hands with a running scoreboard and dealer rotation.
6. The engine is covered by unit tests so the rule fixes stay fixed.

## 3. Work plan (phased; each phase is independently shippable)

### Phase 0 — Dev environment and safety net
- `npm install`; add `.env.example`; fix `setup` script.
- Add **Vitest** with unit tests for `handValidator`, `scoring`, and a `GameManager` harness
  (deterministic seeded deck). Lock in current behaviour before changing it.
- Add an in-memory Mongo fallback for dev/test (`mongodb-memory-server`) so the app runs with no
  external DB. Production path unchanged.

### Phase 1 — Mechanism correctness
- Single action path: socket is the only write channel; REST `/api/game/action` becomes a thin
  wrapper that the client no longer calls in parallel. Add idempotent action ids.
- Claim resolution: collect responses from all eligible players (or until timeout), then resolve
  by priority Hu > Kong > Peng; multiple simultaneous Hu allowed (multiple winners on one discard).
- Turn / claim timer on the server (configurable, default 20 s turn, 8 s claim) with auto-discard
  of the drawn tile and auto-pass. Timer deadline broadcast to clients.
- Track `lastDiscarderId` and `lastActionWasKongDraw`; implement discard win (discarder pays), self-draw
  (+1 fan, all pay), win after kong, shoot after kong, robbing the kong.
- Make kong settlement zero-sum with explicit transfers.
- Missing-suit declaration phase (`CHOOSING_SUIT`) after dealing: each player picks dots/characters/bamboo;
  `canWin` rejects hands that still contain the declared suit; discards of the missing suit are
  forced first.
- Persist a `ScoreEvent[]` ledger per game (type, from, to, points, fan breakdown). Final scores
  are the sum of the ledger — one source of truth for overlay, history, and tests.
- Fix `handleHu` validate-before-mutate, discard history tile, ting recompute after melds.
- Multi-hand sessions: `nextHand()` keeps players, rotates dealer (winner stays dealer if they
  won, else next seat), accumulates `sessionScores`; "Play again" button for the host.

### Phase 2 — Sharing and identity
- Short room codes (6 chars, unambiguous alphabet) alongside the UUID; `/join/[code]` route.
- Guest login: nickname only, server-issued signed session cookie; Google OAuth remains.
- Bind seat to session: server resolves `playerId` from the cookie, never from the URL/body.
  Room link becomes `/room/CODE` with no secrets.
- Reconnect grace: on disconnect mark the seat "away" for 60 s; rejoin re-attaches the socket;
  only after grace (or host explicitly closes) is the room dismissed.
- Invite panel in the waiting room: copy link, copy code, QR code, "share" via Web Share API.
- Collapse the three room models to one (`gameManager` game + Socket.IO room membership);
  delete the unused `rooms` API or mark it deprecated.

### Phase 3 — UI redesign
- New tile component: SVG tile faces (dots drawn as circles, bamboos as sticks, characters as
  numerals + characters), consistent sizing via CSS variables, `prefers-color-scheme` aware.
- Table layout rebuilt with CSS grid; opponents show tile-back counts + melds + a compact discard
  river; self hand docked to the bottom edge with large touch targets. No page rotation.
- Persistent HUD: wall count, round/hand number, dealer marker, each seat's missing-suit badge,
  ting lamp, running session score, turn timer ring on the active seat.
- Action bar anchored above the hand (pung / kong / win / pass, discard confirm) — no scrolling.
- Lobby and join pages restyled to the same design system; remove stale text; "Open tables"
  shows code, host, seats, and a Join button.
- Chat / event log drawer (uses existing `chat:message`), plus quick emotes.

### Phase 4 — Animations, feedback, scoring presentation
- Tile motion: draw slides from wall into hand; discard flies to the river; claimed tile flies to
  the claimer's meld area (Vue `<TransitionGroup>` + FLIP, `prefers-reduced-motion` respected).
- Claim call-outs: large pung / kong / win / self-draw stamp animation at the acting seat; turn-change pulse.
- Score pop-ups when points change (+2 kong, −4 pay-out) floating from the seat.
- Result screen: staged reveal — winning hand laid out, fan list animates in line by line
  (hand type, roots, self-draw, kong bonuses), then totals and session scoreboard; "Play again".
- Optional sound set (tile click, claim, win) with a mute toggle remembered per device.

### Phase 5 — Tests, docs, deploy
- Playwright: two-browser-context test — host creates room, guest joins by code, both declare
  suit, play through a scripted deck to a win, see matching results.
- Update README (rules implemented, sharing flow, env vars), screenshots.
- Verify Docker build and Helm values still work (no new runtime dependencies in prod).

## 4. Out of scope (unless requested)
- AI bots that actually play (current "bots" are seat fillers).
- Ranked ladder / ELO.
- Native mobile apps.

## 5. Decisions (2026-11-10)
1. In-memory database fallback: yes, a plain-Map adapter (no mongod process, no CPU cost) used
   when `MONGODB_URI` is unset; optional JSON snapshot in `.data/` so dev restarts keep users.
2. Timers: host sets per room (turn 10–60 s, claim 5–20 s, or off). Defaults 20 s / 8 s.
3. House rules: use the "standard online table" below as the default preset, with the Sichuan
   Bloody Rules (MIL 2017) table as a second preset. Host picks per room.
4. Admin cheat Hu / show-all-cards stay, hidden behind the admin flag.

## 6. Rule set (from references)

Primary references: the Sichuan Bloody Rules summary published by the Mahjong International
League (2017, 3 pages), the DoubleWin Blood Battle guide, and the Riichi Advanced Sichuan spec.
Chinese guides (CSDN, GameTea, pook.com) agree on mechanics but differ on fan values, so fan
values are a per-room preset.

### Mechanics (both presets)
- 108 tiles, three suits, no honours. Peng and Kong only, no Chow.
- swap three: after the deal every player picks 3 tiles of one suit; direction
  (clockwise / anticlockwise / across) is drawn at random and revealed after all confirm. Toggle.
- void suit: each player must name a suit; cannot win while holding it; tiles of the
  void suit must be discarded before any other tile.
- Blood Battle: after a win the others keep playing until three have won or the wall is empty.
- multiple winners on one discard: several players may win on the same discard; each is paid by the discarder.
- Claim priority: Hu > Kong > Peng; all eligible players are asked, resolved together.
- passed-win lock: a player who passes on a winnable discard cannot win by discard on that tile until
  they draw again, unless the fan value has increased.
- kong payments (immediate, zero-sum, only active players pay):
  exposed kong (kong from a discard) discarder pays 2; concealed kong (concealed) each active player pays 2;
  added kong (extend a Peng) each active player pays 1.
- robbing the kong: when a player extends a Peng to a Kong, others may win on that tile; the kong is void.
- kong transfer / kong refund: if the kong player immediately deals the winning tile (shoot after kong), the
  kong income moves to the winner.
- win after kong: winning on the replacement tile after a kong counts as self-draw +1 fan.
- last-tile self-draw / last-tile discard win: winning on the last wall tile or the discard after it, +1 fan.
- Heavenly Hand / Earthly Hand: dealer wins on the opening 14 / non-dealer wins on first draw with no claims.
- Payment: discard win the discarder pays 2^fan; self-draw every active
  non-winner pays 2^fan with +1 fan (self-draw +1 fan; preset may use +1 base instead, self-draw +1 point).
- End of hand when the wall is empty (draw) with two or more non-winners:
  1. flower pig penalty: a player still holding three suits pays every non-pig non-winner the cap value.
  2. not-ready penalty: a non-ready player pays every ready player that player's best possible hand value.
  3. kong refund: non-ready players return all kong income they collected this hand.
- Dealer rotation: first winner of the hand deals next; if several won on one discard the
  discarder deals; if nobody won the dealer stays.
- Session: scores accumulate across hands; host can start the next hand or end the session.

### Preset A — "Standard online table" (default)
Score = 2^fan, additive fan, cap selectable 3 / 4 / 5 / none (default 4 = 16×).

| Hand type (take the highest) | Fan |
|---|---|
| Basic Win | 0 |
| All Pungs | 1 |
| Full Flush | 2 |
| Seven Pairs | 2 |
| Golden Hook (single wait, all melds exposed) | 2 |
| All Terminals (every set and the pair contain a 1 or 9) | 2 |
| 2-5-8 Pungs (all pungs of 2/5/8) | 3 |
| Dragon Seven Pairs (Seven Pairs with a quad) | 3 |
| Pure Pungs (flush + all pungs) | 3 |
| Pure Seven Pairs (flush + seven pairs) | 4 |
| Pure Golden Hook (flush + single wait) | 4 |
| Pure Terminals (flush + terminals) | 4 |
| Pure Dragon Seven Pairs | 5 |
| Four Kongs | 4 (+ roots) |
| Heavenly Hand / Earthly Hand | cap |

Additive: root (each four-of-a-kind) +1, self-draw +1, win after kong +1, shoot after kong +1, robbing the kong +1, last tile +1.

### Preset B — "Sichuan Bloody Rules (MIL 2017)"
Score = 2^fan, cap 3 (8 points). Root +1 each, All Pungs +1, Golden Single Wait +1 (+1 more
if all pungs), Full Flush +2, Seven Pairs +2, Win after Kong +1, Shoot after Kong +1, Robbing
the Kong +1, Under the Sea +1. Self-draw: base + 1 point from each active player (+1 point).
Flower pig pays a flat 48; not-ready pays ready players their maximum hand value.

## 7. New mechanics and gimmicks to add (were not in the game)
- swap three exchange phase with the random-direction reveal animation.
- void suit declaration phase with forced void-suit discards and a per-seat suit badge.
- Blood River mode toggle: winners keep playing with a locked hand and can win repeatedly; the
  hand ends only at wall exhaustion.
- multiple winners on one discard, robbing the kong, win after kong, shoot after kong with kong transfer, last-tile self-draw, Heavenly Hand / Earthly Hand, passed-win lock.
- flower pig penalty, not-ready penalty, kong refund at wall exhaustion.
- Ting helper: when ready, show the winning tiles, how many of each remain unseen, and the fan
  each would score (standard online-client feature).
- Auto-sort, auto-pass, auto-play after timeout (auto-play) when a player is away.
- Session scoreboard with hand-by-hand history and a shareable result card.
- Quick chat / emotes, sounds with mute, haptics on mobile.
- Room settings panel for the host: preset, cap, self-draw mode, swap three on/off, Blood River on/off, timers.
