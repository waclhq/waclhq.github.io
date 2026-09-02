# AI Complex Put Desk

A single-page options desk for a book that pays if the AI trade busts. Two desks:

- **First-order: the complex.** Puts on NVDA, SMH, AVGO, TSM, MU, ORCL and the rest, priced on a skew-calibrated Black-Scholes surface and ranked by payoff per premium dollar at the drawdown you choose.
- **Second-order: low-vol channels.** Instruments with implied vol under 20 that an AI bust reaches only through financing, power demand, rates and FX: HYG, BKLN, AEP, XLI, AMLP puts and TLT, FXY calls. Each leg carries its transmission chain, its beta to the complex, its kill switch, and a vol and skew fitted to live quotes on the same day. The chart benchmarks the book against the same premium in SMH puts.

Every input is editable and persists in the browser. Contracts are floored to whole numbers so the budget is never exceeded.

## Data

Seeded from IBKR pulls on 2026-09-02: spot, 30-day implied vol, 52-week IV percentile and 30-day realized vol for 70 names (the live vol screen at the bottom of the page). First-desk skew and term structure were fitted to SMH and NVDA December 2026 put mids. Second-desk legs were each fitted to their own December 2026 or January 2027 chain.

Two findings from that calibration are built into the page: the listed private-credit lenders (ARCC, BXSL) price their puts at 28 to 32 vol despite a headline 30-day figure near 15, so they fail the under-20 test and sit at zero weight; and bond-ETF puts carry a fat smile that a linear skew misses, so those legs use their fitted parameters rather than the default.

## Run it

Open `index.html` in a browser. No build, no dependencies. To host it, enable GitHub Pages on this repository (Settings, Pages, Source: GitHub Actions); the included workflow publishes on every push to `main`.

## Model notes

- IV at strike K and T days: `IV30 * (T/30)^term + slope * sk * ln(K/S) * sqrt(107/T)` plus a wing term. Defaults: term 0.08, slope -0.28, sk 1 (each row can override sk; bond and FX legs use fitted values, some negative for call skew).
- Buys are priced at mid plus half the row's haircut, sells at mid minus half.
- Strikes are limited to 4 sigma of the row's own vol, and spreads whose short leg is worth under 8% of the long leg are dropped as degenerate.
- Blend scoring is the expected multiple under a discrete crash distribution: 40% the move stops at two thirds of target, 40% it hits target, 20% it overshoots to 1.5x.

Not trade advice. Model prices differ from real mids, more so on illiquid names and far-OTM strikes.
