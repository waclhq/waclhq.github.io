# Wharton Alum Champions League — Commissioner's Ledger

A web app for running the league: 22 seasons of history, keeper contracts, trade
approvals, and three separate sets of books (auction dollars, FAAB, real cash).

Seeded from `FFL Stats and Keepers_2026 PreSeason.xlsx`. The derived auction-dollar
ledger is reconciled against that workbook's `Trade $$$` tab on every seed run.

## How it works

There is no server. **The repository is the database.**

| Concern | Mechanism |
| --- | --- |
| Reads | Static JSON in `public/data/`, served by GitHub Pages |
| Writes | GitHub Contents API, straight from the browser — every change is a commit |
| Auth | A fine-grained GitHub PAT held in the commissioner's `localStorage` |
| Audit log | `git log public/data/` — who changed what, when, and why |
| Live scores | A scheduled GitHub Action pulls Yahoo and commits `live.json` |

Anyone with the link can read everything. Only a token with push access can write.

## First-time setup

### 1. Install and seed

```bash
npm install
```

```bash
npm run seed -- "C:/Users/tajar/Downloads/FFL Stats and Keepers_2026 PreSeason.xlsx"
```

The seed script needs Python with `openpyxl`. It regenerates every file in
`public/data/` **except** `cash.json`, `faab.json`, and `trade-queue.json` — those
are owned by the app and are never overwritten once they exist.

### 2. Run locally

```bash
npm run dev
```

### 3. Turn on GitHub Pages

In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions.**

Push to `main` and the deploy workflow publishes to
`https://waclhq.github.io/`.

### 4. Unlock commissioner mode

1. Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)
   scoped to **only this repository**.
2. Grant **Repository permissions → Contents → Read and write**. Nothing else.
3. Open the site, click the status pill at the bottom of the sidebar, paste the token.

The token stays in that browser. To revoke access, delete the token on GitHub — no
redeploy needed. Because writes are commits, GitHub Pages republishes a minute or
two later; until it does, the app holds your edits locally so the numbers stay right.

## Yahoo sync — waiting on provisioning

**Status: approved, not yet provisioned.** The `invalid_scope` wall this hit all
of last season was Yahoo gating its Fantasy API behind an application. That
application was **approved on 10 September 2026**; what remains are three steps
on Yahoo's side, listed under *Finishing provisioning* below. Nothing in this
repo is blocking.

The workflow runs on a schedule already and is safe to leave that way: it checks
for the four `YAHOO_*` secrets first and, when they are missing, writes a notice
and skips instead of failing, so an unprovisioned repo never mails a red run. A
**manual** run with no secrets fails on purpose, so pressing the button is never
answered with silence. Every run — provisioned or not — parses the fixture
first, so the payload parsers cannot rot while this waits.

Until the standings land, waiver claims are logged on the Finances page, which
applies the same keeper-cost sliding scale automatically.

The action pulls standings **and waiver transactions** into
`public/data/live.json`. Until the first successful run the app simply omits the
live panels. FAAB bids that arrive this way are shown read-only on Finances, with
keeper cost already computed from the sliding scale.

### Finishing provisioning

These three are on Yahoo's side and cannot be done from this repo. They come
from the approval mail (10 Sep 2026, *Personal Use — API Access and Use
Agreement*):

1. Sign the DocuSign **API Access and Use Agreement**.
2. On <https://developer.yahoo.com/apps/> confirm the app has **Fantasy Sports
   → Read** permission, and note its **Client ID**.
3. Submit the **Developer Application Confirmation Form** with the name, email
   and client ID on the developer account. Send it whether or not Fantasy
   Sports already appears in the permission list, and list every email address
   used during the application in the notes field.

Access is provisioned shortly after both the signature and that form arrive.

### One-time setup

1. Create an app at <https://developer.yahoo.com/apps/create/> with
   **Fantasy Sports → Read** permission. Note the Client ID and Client Secret.
   (If the approved app already exists, use it rather than making a second one —
   provisioning is tied to the client ID submitted on the confirmation form.)

2. Run the auth helper. It prints the refresh token **and lists your league keys**,
   so there is nothing to look up by hand:

```bash
YAHOO_CLIENT_ID=xxx YAHOO_CLIENT_SECRET=yyy node scripts/yahoo-auth.mjs
```

   The league is **Wharton Alum Champions League, id 134099**, so the key the
   helper prints for this season ends `.l.134099`.

3. Add four [repository secrets](https://github.com/waclhq/waclhq.github.io/settings/secrets/actions):
   `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET`, `YAHOO_REFRESH_TOKEN`, `YAHOO_LEAGUE_KEY`.

4. Run **Actions → Yahoo standings sync → Run workflow** once by hand. Nothing
   else needs switching on: the Tuesday and Wednesday runs start working by
   themselves, the Ledger's live panel appears as soon as the first
   `live.json` is committed, and the scoreboard appears the first game window
   after that.

`public/data/yahoo-map.json` is pre-seeded with the 2026 team names, so teams
resolve to managers on the first run. If a team was renamed on Yahoo, the run log
and the dashboard both name it; add its Yahoo team key to that file.

### Live scores

A second job, `.github/workflows/yahoo-scores.yml`, runs `scripts/yahoo-scores.mjs`
every ten minutes inside the game windows (Thursday night, Saturday and Sunday
from 1pm ET, Sunday and Monday nights) and publishes this week's matchups —
points so far, Yahoo's projection, win probability — as `scores.json` on the
repo's orphan **`live`** branch. Not `main`: eighty commits a Sunday would bury
the trades and rulings that make `main`'s log the audit trail, and a push to
`live` triggers no deploy. The branch holds exactly one commit and is rewritten
each time, and nothing is pushed unless a number moved. The site reads it from
`raw.githubusercontent.com` (`src/lib/scores.ts`), which caches for five
minutes, so the Ledger's scoreboard runs about a quarter of an hour behind
Yahoo and says so. It uses the same four secrets and the same skip-until-
provisioned guard as the standings sync, and renders nothing until the branch
exists.

### Checking the parsers without credentials

```bash
node scripts/yahoo-sync.mjs   --fixture scripts/fixtures/yahoo-standings.json
node scripts/yahoo-scores.mjs --fixture scripts/fixtures/yahoo-scoreboard.json
```

Both scripts share `scripts/lib/yahoo.mjs` (token refresh, one authenticated
GET, the two helpers that make Yahoo's JSON readable, the team → manager map)
and each still runs alone and writes only its own file.

## Notable views

- **Contract board** (Keepers) — every keeper contract as a bar running to its
  expiry, with committed salary totalled per future season.
- **Trade flow** (Records) — managers on a circle, arcs weighted by the auction
  dollars exchanged between each pair. Hover isolates one manager.
- **Champions wall** (Records) — 22 title seasons, repeat winners set larger.
- **Player dossiers** (`/players/:name`) — every roster appearance, salary, and
  trade for any player the league has ever rostered.
- **Command palette** — `⌘K` (or `/`) searches pages, managers, players, and
  trades with subsequence matching, so `jgib` finds Jahmyr Gibbs.

## League rules the app enforces

- **Draft budget** — `$200 − keeper salaries ± auction dollars traded for that season`.
  Negative budgets are allowed and flagged (El Morro entered 2026 at −$5).
- **Contracts** — years A→D, four seasons maximum. Players at D are shown as
  ineligible on the ending-roster view.
- **FAAB keeper cost** — the sliding scale on the bid as a percentage of the $100
  budget: 0–20% → $5, 21–40% → $10, 41–60% → $15, >60% → $20. Verified against
  every 2025 claim that carried into the 2026 rosters. A drafted player
  re-acquired off waivers keeps the *greater* of auction value and waiver cost.
- **Anti-dumping** — a trade moving less than $10 in the subsequent year is
  flagged, and the commissioner can hold it for a 24-hour market check with a
  live countdown. Per the rule's own example, $5/$10 triggers and $10/$2 does not.

## Data files

| File | Owner | Contents |
| --- | --- | --- |
| `league.json` | seed | Budgets, keeper slots, FAAB scale |
| `managers.json` | seed | 16 managers; surname ↔ first-name mapping |
| `seasons.json` | seed | 2004–2025 final tables |
| `keepers.json` | seed | Ending rosters + keeper selections, 2015–2026 |
| `trades.json` | seed | 34 structured trades, 2023–2025 |
| `trade-ledger.json` | seed | Derived received/sent/net by year |
| `waivers.json` | seed | 2025 FAAB claims |
| `legacy-trades.json` | seed | Free-text trade log, 2013–2022 |
| `rules.json` | seed | Rule sheet, verbatim |
| `trade-queue.json` | **app** | Proposals and rulings |
| `faab.json` | **app** | In-season waiver claims |
| `cash.json` | **app** | Dues, payouts, side bets |
| `live.json` | action | Yahoo standings |
| `yahoo-map.json` | manual | Yahoo team key → manager id |

## Manager name mapping

The stat sheets record surnames; the trade sheets record first names. The join was
derived from the 2025 standings (team → surname) against the 2026 keeper sheet
(team → first name):

| Team | Trades | Stats |
| --- | --- | --- |
| Malikety Split | Tajar | Varghese |
| I Must Break You | Stu | Waldman |
| El Morro | Felix | Tollinche |
| SuperBowlJesus | Alex | Buzik |
| no ragrets | Jim | Incognito |
| Bridge N Tunnel | Dave | Konciak |
| Karma's L-Ah-Ma-tize | Anik | Mukheja |
| Whobody Wants It? | Nate | Snyder |

Baugh, Bernstein, Lalwani, and Velamoor use the same name in both. Evans,
Banerjee, Kim, and Kurucz are former managers.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build into `dist/` |
| `npm run typecheck` | TypeScript, no emit |
| `npm run seed -- <xlsx>` | Rebuild `public/data/` from the workbook |
| `npm run yahoo:sync` | Pull Yahoo standings (needs the env vars) |
