# Blood on Mahjong

Real-time multiplayer Sichuan mahjong ("Blood Battle" and "Blood River" variants) in the browser. Create a table, send the six-letter code or link to friends, and play — no account needed.

---

## Demo

![Waiting Room](screenshots/waiting-room.png)
![Game Room](screenshots/game.png)
![Results](screenshots/result.png)

---

## Playing with friends

1. Open the site, type a nickname, press **Play**.
2. Press **New table**. You get a room code such as `K7QM2X`, a QR code, and a copy-link / share button.
3. Friends open `https://<your-host>/join/K7QM2X` (or type the code on the home page), pick a nickname and sit down.
4. Short of players? The host can add **bot seats**. Two to four players are supported.
5. The host sets the rules and timers, then presses **Start**. After each hand the host deals the next one and the session scoreboard keeps a running total.

Refreshing or briefly losing connection keeps your seat. While you are away your seat is auto-played and you take over again as soon as you are back.

---

## Rules implemented

Two rule tables are built in and the host can switch per room:

| | Standard online table (default) | Sichuan Bloody Rules (MIL 2017) |
|---|---|---|
| Fan cap | 4 (selectable 3 / 4 / 5 / none) | 3 |
| Self-draw bonus | +1 fan | +1 point per payer |
| Flower pig penalty | cap value to each opponent | 16 to each opponent |
| Swap three | on | off |

**Flow:** swap three tiles with a neighbour (random direction) → declare a void suit → play. No chow; pung and kong only. A hand that still holds its void suit cannot win, and void-suit tiles must be discarded first.

**Claims:** Win beats Kong beats Pung. Every eligible player is asked; several players may win on one discard.

**Mechanics:** Blood Battle (play on after a win until three have won or the wall runs out), optional Blood River (winners keep playing with a locked hand and can win again), robbing the kong (win on a tile someone adds to a pung), win after kong, shoot after kong with kong transfer (kong income moves to the winner), last-tile wins, Heavenly and Earthly hands, and the passed-win lock (passing a win blocks that tile until your next draw).

**Scoring:** points = base × 2^fan. Discard wins are paid by the discarder only; self-draws by every active player. Kongs pay immediately and are zero-sum: an exposed kong takes 2 from the discarder, a concealed kong 2 from each active player, an added kong 1 from each. At a draw (the wall runs out): the flower pig penalty (a player still holding three suits pays), the not-ready penalty (not-ready players pay ready players their best hand), and the kong refund (not-ready players return kong income). Every point is recorded in a per-hand ledger shown on the result screen.

**Hand types (standard table):** Basic Win 0, All Pungs 1, Full Flush 2, Seven Pairs 2, Golden Hook 2, All Terminals 2, Four Kongs 2, 2-5-8 Pungs 3, Dragon Seven Pairs 3 (Seven Pairs + a root), Pure Pungs 3, Pure Seven Pairs 4, Pure Golden Hook 4, Pure Terminals 4, plus +1 per root (each set of four identical tiles).

Rule references: the Mahjong International League "Brief Introduction to Bloody Mahjong" (2017), the DoubleWin Blood Battle guide, and the Riichi Advanced Sichuan spec. Fan values differ between regions, which is why the rule table is a room setting.

---

## Features

- **Shareable rooms** — six-character codes, `/join/CODE` links, QR code, native share sheet
- **Guest play** — nickname only; Google OAuth still available
- **Server-authoritative engine** — one action path over Socket.IO, per-player masked views, seat bound to the session cookie
- **Turn and claim timers** — host-configurable per room, auto-play on timeout
- **Ting helper** — shows your winning tiles, how many are still unseen, and the fan each would score
- **Animations and sound** — tile motion, Pung / Kong / Win stamps, floating score changes, staged result reveal, synthesised sounds with mute; respects `prefers-reduced-motion`
- **Chat and emotes**, session scoreboard, hand history, match history
- **Admin tools** (hidden behind the admin flag) — reveal all hands, test win
- **Runs with no database** — a built-in in-memory store is used when `MONGODB_URI` is unset

---

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | Vue 3, Nuxt 4, Nuxt UI, TypeScript |
| **Backend** | Nuxt Server (Nitro), Socket.IO, Node.js |
| **Database** | MongoDB, or the built-in in-memory store for development |
| **Cache / Pub-Sub** | Redis (optional Socket.IO adapter) |
| **Auth** | Guest sessions, Google OAuth 2.0 |
| **Infrastructure** | Docker, Kubernetes, Helm, Werf |
| **Testing** | Vitest (engine), Playwright (end to end) |

---

## Development

Prerequisites: Node.js 20+. MongoDB and Redis are optional.

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without `MONGODB_URI` the server uses the in-memory store and snapshots it to `.data/memory-db.json`, so restarts keep users and history. Five dev accounts (Player 1–4 and Admin) are seeded automatically outside production.

Copy `.env.example` to `.env` to use MongoDB, Redis or Google sign-in:

```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=blood_on_mahjong
REDIS_URL=redis://localhost:6379
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

### Tests

```bash
npm run test:unit   # engine rules, scoring, timers, 120 randomised full hands
npm run test:e2e    # Playwright: two browsers + two bots play a full hand (needs the dev server)
npm test            # both
```

### Production

```bash
npm run build
npm run start
```

### Deploying to Vercel

Vercel runs the server as short-lived serverless functions, so there is no long-running process for
Socket.IO or in-memory game state. When built on Vercel the app switches to **polling mode**
automatically: each browser asks `POST /api/game/poll` for updates about once a second, MongoDB
holds all game state, and turn/claim timers are applied whenever someone polls.

1. Create a free MongoDB Atlas cluster. Under *Network Access* allow `0.0.0.0/0` (Vercel has no
   fixed IPs) and copy the connection string. Pick the region closest to your Vercel functions
   (Vercel's default is Washington, D.C., `iad1`, so AWS `us-east-1`).
2. Import the repository in Vercel. The Nuxt preset is detected; no `vercel.json` is needed.
3. Set environment variables in *Project Settings → Environment Variables*:
   - `MONGODB_URI` (required; without it every request fails with a clear error)
   - `MONGODB_DB` (optional, defaults to `blood_on_mahjong`)
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI=https://<your-domain>/api/auth/google/callback`
     (optional; guest login works without them)
4. Deploy. Leave `REDIS_URL` unset; it is only for multi-server Socket.IO.

To try polling mode locally: `NUXT_PUBLIC_REALTIME=poll npm run dev`. Set
`NUXT_PUBLIC_REALTIME=socket` to force sockets, for example on a VPS that happens to set `VERCEL`.

Cost note: every open room page makes about one request per second (one every 2.5 s when the tab
is in the background). An hour of four players is roughly 15,000 function invocations, which fits
comfortably in Vercel's free Hobby allowance for casual play.

---

## Project Structure

```
blood-on-mahjong/
├── shared/types/          # Game types shared by server and client
├── server/
│   ├── engine/            # Pure rules engine: hands, fan, claims, timers, settlement, views
│   ├── utils/             # gameManager (orchestration), socket, persistence, memory DB, sessions
│   ├── api/               # REST endpoints (auth, game, history, profile)
│   └── plugins/           # Socket.IO bootstrap, dev account seeding
├── app/
│   ├── pages/             # login, lobby, room/[code], join/[code], history
│   ├── components/        # Table, seats, tiles (SVG), action bar, result overlay, invite, settings
│   └── composables/       # useGameRoom (socket), useSession, useSound
├── tests/unit/            # Vitest engine tests
├── tests/e2e/             # Playwright multiplayer test
├── docs/                  # Enhancement plan and deployment notes
├── .helm/  Dockerfile  werf.yaml
```

---

## License

MIT
