# WACL League HQ — working notes

The Wharton Alum Champions League: a 12-team auction keeper league running
since 2004. This is its record book, its trade desk, and its trash talk.
Live at https://waclhq.github.io from `waclhq/waclhq.github.io`.

## Architecture in one paragraph

A static React 19 + Vite + Tailwind v4 site on GitHub Pages. **The repo is
the database:** `public/data/*.json` is read publicly, and the commissioner
writes to it from the live site through the GitHub Contents API, so every
ruling is a commit and `git log` is the audit trail. There is no server and
no backend — do not propose adding one. HashRouter, so no basename to
maintain; the data layer reads `import.meta.env.BASE_URL`, which follows the
Vite `base` (currently `/`, an org root site). The room is a WebGL
liquid-glass backdrop (`Backdrop.tsx`, CSS aurora fallback) with opaque
panels floating on it; route changes use view transitions with the chrome
held still. Builds are stamped (`vite.config.ts` emits `version.json`) and
the Shell offers a refresh when a newer build is live.

## Rules that are easy to break

1. **Never edit `public/data/*.json` in a PR.** The commissioner owns those
   files through the app. A code change that also rewrites league data will
   silently clobber trades, keepers, or cash entries made from a phone.
   The one exception is a deliberate, explained data repair.

2. **The workbook is the constitution.** Where a stat exists in the league
   spreadsheet, the site must tie to it exactly — even when the workbook's
   method is statistically unusual. Two known cases, both settled:
   - Career points per game is the **mean of season averages**, not a
     games-weighted average.
   - All-time career averages and per-season scoring extremes come from the
     book's **adjusted** matrix (2004–2006 are re-scored for era inflation),
     shipped in `career-averages.json`. Never recompute these from
     `seasons.json`; the raw numbers are pre-adjustment and wrong for this
     purpose. Same for `game-records.json` (single-game high/low).
   If a number disagrees with the spreadsheet, it is a bug in the site.

3. **Data scripts are standalone on purpose.** `scripts/etl.py` reseeds from
   the workbook and would overwrite app-maintained keeper edits, so the
   newer extractors (`game_records.py`, `career_averages.py`,
   `draft_pool.py`, `player_points.py`, `player_positions.py`) each run
   alone and touch only their own output file. Keep it that way.

4. **Motion is gated.** Devices requesting reduced motion get stillness by
   default; the FX toggle overrides. CSS animations sit behind the
   `:root:not([data-motion='on'])` guards in `index.css`, and JS/canvas work
   checks `animationsDisabled()`. Anything new that moves must honor both.
   Videos: muted + `playsInline` + `autoPlay={!animationsDisabled()}`.

5. **Verify before claiming.** Run `npm run build` (type-check + build). If
   a change is visible in the browser, say what you checked.

6. **Page styles live with the page.** `src/index.css` holds tokens and the
   shared primitives (`.win`, `.out`, `.tag`, `.badge`, `.btn`, rails, the
   reduced-motion guard). Each room has its own sheet in `src/styles/`
   (`ledger`, `book`, `almanac`, `profile`, `boards`, `tables`, `ops`),
   imported at the top of `index.css`; a page's animations are guarded in
   its own sheet. Keep it that way so parallel work merges cleanly.

7. **"Your seat" is a preference, not a login.** `useMe()` (`src/lib/me.ts`)
   returns the manager a member picked on this device; `ManagerTag` marks
   their rows (`.me-tag`, lit by `--me-color` on the root), the backdrop
   tints toward their colour, pages may put "you" first. Nothing trusts it
   and nothing writes because of it.

8. **League time comes from `src/lib/season.ts`.** `seasonClock()` derives
   pre-season / kickoff week / week N / playoffs / offseason from the
   calendar; use it for eyebrows, countdowns and batch labels rather than
   literals that go stale in October.

## Layout

- `src/pages/` — one file per route (Dashboard is "Ledger", plus Trades,
  Keepers, Draft, Finances, Standings, Managers, Records, Lab, Almanac,
  Rules, Guide).
- `src/lib/` — `data.tsx` (loader, writable-overlay, `save()` which also
  broadcasts `wacl:save` events for the Shell's SaveStatus strip),
  `github.ts` (Contents API + `friendlySaveError`), `vault.ts`
  (password-sealed token), `rules.ts` (league rules), `stats.ts` +
  `analytics.ts` (career tables — `bookCareerTable` is the one to print —
  and Lab metrics), `roster.ts` (approved trades move players), `me.ts`
  (your seat), `season.ts` (league time), `dialog.ts` (focus manners for
  overlays), `search.ts` (palette index), `music.ts`, `motion.ts`.
- `src/components/` — `Shell.tsx` (nav, tab bar, sheet, seat picker,
  SaveStatus, new-version bar), `Backdrop.tsx` (the glass), canvas pieces
  (`HeapScene`, `FireFrame`, `BurnAway`, `TradingCard`), editors
  (`TradeForm`, `KeeperEditor`).
- `src/styles/` — one stylesheet per room (see rule 6).
- `scripts/` — Python ETL/extractors, `manager_icons.mjs` (exports every
  manager badge to `assets/manager-icons/`, read-only on league data), and the
  Yahoo sync (parked: Yahoo now gates its Fantasy API behind an application).
- `public/media/` — league video and the original `wacl-theme.mid`, which is
  generated by `scripts/wacl_theme.py` and performed live by `music.ts`.

## Design system

Sportsbook slate — the "DraftKings at 1am" direction, chosen over broadcast
and modern-app alternatives. Graphite charcoal surfaces, one signature green
(`--color-arc-green`) that means money, amber for favorites and warnings.
**Barlow Condensed Bold Italic** for display type (page titles are uppercase
italic; hero numbers lean), **Inter** for body and table data with tabular
figures, IBM Plex Mono only for chart axes and `kbd`. Tokens live in the
`@theme` block of `src/index.css` — use them, never raw hex, so the palette
stays swappable. Tables use the real `.out` table class (thead and tbody must
share one column grid or headers drift).

## Voice

Dry, confident, specific. Panel subtitles explain the metric in a sentence.
The Lab roasts people using their own numbers. The commissioner is
non-technical and reads `/guide` — keep that page in plain language and
update it when a commissioner-facing workflow changes.
