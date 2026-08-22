import type { ReactNode } from 'react'
import { Panel, PageHeader } from '../components/ui'

/**
 * The Commissioner's Manual — written for a commissioner who did not build
 * this site and never wants to hear the word "repository". Every instruction
 * names the exact buttons on screen. Anyone can read it; the tasks it
 * describes only work after commissioner sign-in.
 */

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="arcade mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border-2 border-arc-line bg-arc-raised text-[11px]">
        {n}
      </span>
      <span className="text-[14px] leading-relaxed text-arc-ink-soft">{children}</span>
    </li>
  )
}

function B({ children }: { children: ReactNode }) {
  return <span className="font-bold text-arc-ink">{children}</span>
}

export default function Guide() {

  return (
    <>
      <PageHeader
        eyebrow="Read me first"
        title="Commissioner's Manual"
        lede="Everything a commissioner does on this site, in plain steps. No technical anything — if you can use a group chat, you can run the league here."
      />

      <div className="space-y-6">
        <Panel title="1 · signing in" subtitle="One password. That's the entire login system.">
          <ol className="space-y-3 px-5 py-5">
            <Step n={1}>
              On a phone: tap <B>Menu</B> (top right), then <B>Commissioner sign-in</B> at the
              bottom. On a computer: click the <B>sign-in button at the bottom of the left
              sidebar</B>.
            </Step>
            <Step n={2}>
              Type the commissioner password and press <B>Unlock</B>. You get the password from
              whoever runs the site — not from this page.
            </Step>
            <Step n={3}>
              That's it. The bottom bar now shows <B>2 CREDITS</B> instead of 1, and editing
              buttons appear across the site. Each device remembers until you sign out.
            </Step>
          </ol>
        </Panel>

        <Panel
          title="2 · approving or rejecting a trade"
          subtitle="The main event. Trades wait in a queue until you rule."
        >
          <ol className="space-y-3 px-5 py-5">
            <Step n={1}>
              Go to <B>Trades</B>. Anything waiting for you is under the <B>Queue</B> tab — the
              nav shows a number badge when something's waiting.
            </Step>
            <Step n={2}>
              Each trade shows who sells, who buys, the players, and a table of exactly how each
              manager's draft money changes, year by year. The site checks the league rules for
              you — if the anti-dumping rule applies, a <B>Market check</B> warning appears on its
              own.
            </Step>
            <Step n={3}>
              Press <B>Approve</B>, <B>Reject</B>, or — when the warning is showing —{' '}
              <B>Hold 24h for market check</B>, which starts the timer automatically.
            </Step>
            <Step n={4}>
              Done. Budgets everywhere update instantly, and the players named in the trade walk
              over to the buyer's roster on the Keepers page by themselves — a green note under
              the tabs confirms each move (and tells you if a name couldn't be matched). The
              decision is recorded permanently with your name on it. To enter a brand-new trade yourself, use{' '}
              <B>New trade</B> on the same page — pick the two managers, type the players, enter
              the dollars per year, and it reads the trade back to you in a sentence before you
              save.
            </Step>
          </ol>
        </Panel>

        <Panel
          title="3 · money between humans"
          subtitle="Dues, payouts, side bets — the who-owes-who ledger."
        >
          <ol className="space-y-3 px-5 py-5">
            <Step n={1}>
              <B>Season dues are the easy one.</B> The dues board sits at the top of the{' '}
              <B>Ledger</B> (and under <B>Finances → Dues</B>): everyone who has paid on the left,
              everyone who hasn't on the right. When somebody pays you, <B>tick the box next to
              their name</B> — they move across to the paid side and the league sees it. Ticking
              it again undoes it, in case a payment bounces.
            </Step>
            <Step n={2}>
              Managers pay by tapping the green <B>PAY</B> button on their own row, which opens
              Venmo with the amount already filled in. Nothing tells the site a payment arrived,
              so you ticking the box is what makes it official.
            </Step>
            <Step n={3}>
              <B>Everything else</B> — payouts, side bets, one-off fees — goes in under{' '}
              <B>Finances → Cash → Add</B>. Pick the manager, the type, the amount, and a
              one-line description.
            </Step>
            <Step n={4}>
              Money <B>a manager owes the league</B> goes in as a negative number; money{' '}
              <B>the league owes them</B> is positive. The form reminds you.
            </Step>
            <Step n={5}>
              When one of those is squared away, click its <B>Open</B> tag to flip it to{' '}
              <B>Settled</B>. The standing-balances table always shows who still owes what.
            </Step>
          </ol>
        </Panel>

        <Panel
          title="4 · the book (side bets)"
          subtitle="Managers post their own bets. You call the winners — and you're the only one who can fix a call."
        >
          <ol className="space-y-3 px-5 py-5">
            <Step n={1}>
              Managers propose and accept bets themselves on <B>The Book</B>, using the league
              password. A bet somebody has taken shows up under <B>Live action</B>; one taken in
              the last couple of days is <B>wreathed in flame</B>, so this week's action is
              impossible to miss. The fire dies down on its own after two days.
            </Step>
            <Step n={2}>
              When a bet resolves, find it under <B>Live action</B> and <B>tap the name of the
              winner</B>. That is the ruling — it moves the bet down to <B>Settled</B> and puts
              the money on the tab.
            </Step>
            <Step n={3}>
              Called the wrong name, or the terms have a typo? Press <B>✎</B> — on the live bet,
              or in the <B>Fix</B> column of the settled table. You can rewrite the bet, change
              the stake, pick a different winner, or press <B>Nobody yet</B> to put it back on
              the live board as unsettled.
            </Step>
            <Step n={4}>
              The same panel deletes a bet outright: <B>Delete bet</B>, then <B>Delete for
              good</B>. Use it for a bet posted by mistake or as a joke — it disappears from the
              board, the records, and the tab. The history still remembers it, so nothing is
              truly lost.
            </Step>
            <Step n={5}>
              To rewrite terms or delete anything you also need the <B>league password</B>{' '}
              entered on that device (the box at the top of The Book). Changing a winner only
              needs your commissioner sign-in. The panel tells you which one is missing.
            </Step>
          </ol>
        </Panel>

        <Panel
          title="5 · updating a keeper list"
          subtitle="After draft night, or to fix a mistake in any season."
        >
          <ol className="space-y-3 px-5 py-5">
            <Step n={1}>
              Go to <B>Keepers</B>, pick the season from the dropdown, find the team's card, and
              press <B>✎ Edit keepers</B>.
            </Step>
            <Step n={2}>
              Use <B>+ Add from roster…</B> to pick a player, or press <B>×</B> to drop one. You
              only ever choose the players — every salary and contract year is computed from the
              league rules (draft value, or the waiver sliding scale for pickups) and can't be
              typed over. The text box below the list is for the rare player the roster doesn't
              know about; a waiver pickup prices off its bid automatically, anyone else is the $5
              free-agent floor.
            </Step>
            <Step n={3}>
              Press <B>Save keepers</B>. Draft budgets, the contract board, and the war room all
              update everywhere, instantly. The counter above the rows warns you if a team is
              over the keeper limit.
            </Step>
          </ol>
        </Panel>

        <Panel
          title="6 · things that need no work at all"
          subtitle="Most of the site runs itself. Weekly waivers live entirely in Yahoo."
        >
          <div className="space-y-2.5 px-5 py-5 text-[14px] leading-relaxed text-arc-ink-soft">
            <p>
              <B>Standings, records, the Lab, the Almanac, player pages, trading cards, roasts</B>{' '}
              — all computed automatically from the data. Approving a trade updates every number
              that depends on it, everywhere, including 22 years of history math.
            </p>
            <p>
              <B>The Keeper War Room</B> (top of the Keepers page) is a sandbox — click keeper
              combinations and watch the draft budget move. It never changes anything real, so
              play freely.
            </p>
            <p>
              <B>Every change you make is kept forever</B> in a tamper-proof history with the
              date and time. Nothing can be silently lost or edited — if a manager disputes a
              ruling, the receipt exists.
            </p>
          </div>
        </Panel>

        <Panel title="7 · if something looks wrong" subtitle="The two-step fix, then the human.">
          <ol className="space-y-3 px-5 py-5">
            <Step n={1}>
              Refresh the page. Changes take a minute or two to show up on other devices — yours
              shows them instantly, everyone else's after the next refresh.
            </Step>
            <Step n={2}>
              If the password stops unlocking, or anything else misbehaves: <B>message the person
              who built the site</B>. Nothing you can press here can break anything permanently —
              every change is reversible from the history.
            </Step>
          </ol>
        </Panel>
      </div>
    </>
  )
}
