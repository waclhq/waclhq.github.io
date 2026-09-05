import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Panel, PageHeader, SectionNav } from '../components/ui'
import { useLeagueData } from '../lib/data'

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

/** A button or place on screen, named exactly; with `to`, it takes you there. */
function B({ children, to }: { children: ReactNode; to?: string }) {
  if (to)
    return (
      <Link
        to={to}
        className="font-bold text-arc-ink underline decoration-arc-line underline-offset-2 hover:text-arc-green"
      >
        {children}
      </Link>
    )
  return <span className="font-bold text-arc-ink">{children}</span>
}

const SECTIONS = [
  { id: 'signin', label: 'Sign in' },
  { id: 'seat', label: 'Your seat' },
  { id: 'trades', label: 'Trades' },
  { id: 'money', label: 'Money' },
  { id: 'book', label: 'The Book' },
  { id: 'keepers', label: 'Keepers' },
  { id: 'auto', label: 'Automatic' },
  { id: 'closing', label: 'Closing' },
  { id: 'help', label: 'Help' },
]

export default function Guide() {
  const { seasons, league } = useLeagueData()
  const years = seasons.length
  const lastSeason = league.currentSeason - 1

  return (
    <>
      <PageHeader
        eyebrow="Read me first"
        title="Commissioner's Manual"
        lede="Everything a commissioner does on this site, in plain steps. No technical anything — if you can use a group chat, you can run the league here."
      />

      <SectionNav sections={SECTIONS} />

      <div className="space-y-6">
        <Panel id="signin" title="1 · signing in" subtitle="One password. That's the entire login system.">
          <ol className="space-y-3 px-5 py-5">
            <Step n={1}>
              On a phone: tap <B>More</B> (bottom right), then <B>Commissioner sign-in</B> at the
              bottom of the sheet. On a computer: click the <B>sign-in button at the bottom of the
              left sidebar</B>.
            </Step>
            <Step n={2}>
              Type the commissioner password and press <B>Unlock</B>. You get the password from
              whoever runs the site — not from this page.
            </Step>
            <Step n={3}>
              That's it. Editing buttons appear across the site — on a computer the bottom bar
              shows <B>2 CREDITS</B> instead of 1, and on a phone the More sheet shows{' '}
              <B>COMMISH ✓</B>. Each device remembers until you sign out.
            </Step>
          </ol>
        </Panel>

        <Panel
          id="seat"
          title="2 · picking your seat"
          subtitle="For everyone, not just the commissioner. It is a highlighter, not a login."
        >
          <ol className="space-y-3 px-5 py-5">
            <Step n={1}>
              On a phone, open <B>More</B> and tap <B>Pick your seat</B> near the top of the sheet.
              On a computer it sits in the left sidebar, just under <B>Find</B>. Tap your own name.
            </Step>
            <Step n={2}>
              From then on this device lights up your rows in your colour on every table, puts
              your bets first on <B to="/bets">The Book</B> with a ring around them, and fills in
              your name when you propose a bet. Tap the seat again to change or clear it.
            </Step>
            <Step n={3}>
              Nothing trusts it. Picking a seat gives no powers and records nothing; anyone can
              pick any name. It only changes what this phone highlights.
            </Step>
          </ol>
        </Panel>

        <Panel
          id="trades"
          title="3 · approving or rejecting a trade"
          subtitle="The main event. Trades wait in a queue until you rule."
        >
          <ol className="space-y-3 px-5 py-5">
            <Step n={1}>
              Go to <B to="/trades">Trades</B>. Anything waiting for you is under the{' '}
              <B>Queue</B> tab — the nav shows a number badge when something's waiting.
            </Step>
            <Step n={2}>
              Each trade shows who sells, who buys, the players, and a table of exactly how each
              manager's draft money changes, year by year. The site checks the league rules for
              you: if the anti-dumping rule applies, an orange <B>Anti-dumping trigger</B> tag
              appears on the trade by itself, with a <B>Hold 24h for market check</B> button next
              to Approve. Once you hold it, the tag becomes <B>Market check</B> and a countdown
              starts; when the window closes the card says so.
            </Step>
            <Step n={3}>
              Press <B>Approve</B>, <B>Reject</B>, or <B>Hold 24h for market check</B>. Each asks
              once — the button turns amber with the question — so a slipped thumb costs nothing.
              Tap it again to make it official.
            </Step>
            <Step n={4}>
              Done. Budgets everywhere update instantly, and the players named in the trade walk
              over to the buyer's roster on the <B to="/keepers">Keepers</B> page by themselves — a
              green note under the tabs confirms each move (and tells you if a name couldn't be
              matched). If the roster half doesn't save — a bad signal, usually — the trade is
              still approved and shows a <B>Roster move pending</B> tag under <B>Recorded</B> with
              a <B>Retry roster move</B> button; press it when you're back on a connection. The
              decision is recorded permanently with your name on it.
            </Step>
            <Step n={5}>
              To enter a brand-new trade yourself, use <B>New trade</B> on the same page — pick the
              two managers, type the players, enter the dollars per year, and it reads the trade
              back to you in a sentence before you save. It files under the current league week
              (or <B>Preseason</B> before kickoff); tick or untick <B>Preseason deal</B> if it
              guessed wrong. Red notes only appear after you touch a field or press <B>Add to
              queue</B>; the orange anti-dumping note is just information.
            </Step>
          </ol>
        </Panel>

        <Panel
          id="money"
          title="4 · money between humans"
          subtitle="Dues, payouts, side bets — the who-owes-who ledger."
        >
          <ol className="space-y-3 px-5 py-5">
            <Step n={1}>
              <B>Season dues are the easy one.</B> The dues board sits at the top of the{' '}
              <B to="/">Ledger</B> (and under <B to="/finances">Finances → Dues</B>): everyone who
              has paid on the left, everyone who hasn't on the right. When somebody pays you,{' '}
              <B>tick the box next to their name</B> — they move across to the paid side and the
              league sees it. Ticking it again undoes it, in case a payment bounces. Once everyone
              has paid, the board folds down to a single “all paid” line — tap it to reopen.
            </Step>
            <Step n={2}>
              Managers pay by tapping the green <B>PAY</B> button on their own row, which opens
              Venmo with the amount already filled in. Nothing tells the site a payment arrived,
              so you ticking the box is what makes it official.
            </Step>
            <Step n={3}>
              <B>Everything else</B> — payouts, side bets, one-off fees — goes in under{' '}
              <B to="/finances">Finances → Cash → Add</B>. Pick the manager, the type, the amount,
              and a one-line description.
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
          id="book"
          title="5 · the book (side bets)"
          subtitle="Managers post their own bets. You call the winners — and you're the only one who can fix a call."
        >
          <ol className="space-y-3 px-5 py-5">
            <Step n={1}>
              <B>First time only — set the betting password.</B> Open the commissioner panel (the
              same place you signed in) and press <B>🎲 League betting password</B>. Paste the
              bets token the site builder gives you, choose a password, and press <B>Set</B>.
              Share that password with the league in the group chat. It only ever reaches the
              bets board — never keepers, trades or cash — so it is safe to hand around. Members
              type it once, in the box at the top of <B to="/bets">The Book</B>.
            </Step>
            <Step n={2}>
              Managers propose and accept bets themselves on The Book. A bet somebody has taken
              shows up under <B>Live action</B>; one taken in the last couple of days is{' '}
              <B>wreathed in flame</B>, so this week's action is impossible to miss. The fire dies
              down on its own after two days.
            </Step>
            <Step n={3}>
              Bets show as small matchup cards — the two faces, the stake, a LIVE light.{' '}
              <B>Tap a card to open it.</B> When a bet resolves, open its card and <B>tap the name
              of the winner</B>. The button turns amber and asks “Call it for …?”; tap it again and
              that is the ruling — it moves the bet down to <B>Settled</B> and puts the money on{' '}
              <B>The Tab</B>.
            </Step>
            <Step n={4}>
              <B>When the loser pays up:</B> press the <B>✎</B> at the right end of their stub
              under Settled and tick <B>Loser has paid up</B>. The debt comes off The Tab. (Anyone
              with the league password can also press <B>Mark paid</B> on The Tab itself.)
            </Step>
            <Step n={5}>
              <B>Sharing a bet:</B> every open bet has a receipt strip along its bottom — the
              ticket number, who offered it and when, and a <B>Share</B> button. Share sends the
              link (or copies it, and says “Link copied”); whoever opens it lands straight on that
              bet. Settled stubs open the same receipt when tapped.
            </Step>
            <Step n={6}>
              Called the wrong name, or the terms have a typo? Press the <B>✎</B> at the right end
              of the bet — on its open card under Live action, or on its ticket stub under Settled.
              You can rewrite the bet, change the stake, pick a different winner, or press{' '}
              <B>Nobody yet</B> to put it back on the live board as unsettled.
            </Step>
            <Step n={7}>
              The same panel deletes a bet outright: <B>Delete bet</B>, then <B>Delete for
              good</B>. Use it for a bet posted by mistake or as a joke — it disappears from the
              board, the records, and the tab. The history still remembers it, so nothing is
              truly lost.
            </Step>
            <Step n={8}>
              To rewrite terms or delete anything you also need the <B>league password</B>{' '}
              entered on that device. Changing a winner only needs your commissioner sign-in. The
              panel tells you which one is missing.
            </Step>
          </ol>
        </Panel>

        <Panel
          id="keepers"
          title="6 · updating a keeper list"
          subtitle="After draft night, or to fix a mistake in any season."
        >
          <ol className="space-y-3 px-5 py-5">
            <Step n={1}>
              Go to <B to="/keepers">Keepers</B>, pick the season from the dropdown, find the
              team's card, and press <B>✎ Edit keepers</B>.
            </Step>
            <Step n={2}>
              Use <B>+ Add from {lastSeason} roster…</B> to pick a player, or press <B>×</B> to
              drop one. You only ever choose the players — every salary and contract year is
              computed from the league rules (draft value, or the waiver sliding scale for
              pickups) and can't be typed over. The text box below the list is for the rare player
              the roster doesn't know about; a waiver pickup prices off its bid automatically,
              anyone else is the $5 free-agent floor.
            </Step>
            <Step n={3}>
              Press <B>Save keepers</B>. Draft budgets, the contract board, and the war room all
              update everywhere, instantly. If a team is over the keeper limit, an orange warning
              appears under the add box before you save — saving anyway is a commissioner
              override, not a mistake the site will stop.
            </Step>
          </ol>
        </Panel>

        <Panel
          id="auto"
          title="7 · things that need no work at all"
          subtitle="Most of the site runs itself. Weekly waivers live entirely in Yahoo."
        >
          <div className="space-y-2.5 px-5 py-5 text-[14px] leading-relaxed text-arc-ink-soft">
            <p>
              <B>Standings, records, the Lab, the Almanac, player pages, trading cards, roasts</B>{' '}
              — all computed automatically from the data. Approving a trade updates every number
              that depends on it, everywhere, including {years} years of history math.
            </p>
            <p>
              <B>The Keeper War Room</B> (top of the Keepers page) is a sandbox — click keeper
              combinations and watch the draft budget move. It never changes anything real, so
              play freely.
            </p>
            <p>
              <B>Every change you make is kept forever</B> in a tamper-proof history with the
              date and time. Nothing can be silently lost or edited — if a manager disputes a
              ruling, the receipt exists. To see it, open the commissioner panel and press{' '}
              <B>Audit log</B>: it opens the full list of changes, newest first, each with the
              date, the time, and a one-line description of what was done. Bets have their own
              list, linked from the bottom of The Book.
            </p>
            <p>
              <B>Saves tell you what happened.</B> Every time you press something that changes the
              league, a small strip appears above the tab bar (bottom right on a computer):
              “Saving”, then “Saved”, or a plain sentence about what went wrong with a{' '}
              <B>Retry</B> button. If you don't see “Saved”, it didn't save.
            </p>
          </div>
        </Panel>

        <Panel
          id="closing"
          title="8 · closing the season"
          subtitle="The one yearly ritual the site can't do by itself."
        >
          <div className="space-y-2.5 px-5 py-5 text-[14px] leading-relaxed text-arc-ink-soft">
            <p>
              When Yahoo posts the final standings, send the site builder the final table — rank,
              record, points for and against — and who took 1st, 2nd and 3rd. They update the
              league workbook and republish; a day later the Ledger, Standings, Records and every
              career number roll over to the new year.
            </p>
            <p>
              Keepers for the next draft you enter yourself (section 6), and the dues board resets
              with the new season. Nothing on the site needs to be pressed to close a year — until
              the republish, the desk simply keeps celebrating last year's champion.
            </p>
          </div>
        </Panel>

        <Panel id="help" title="9 · if something looks wrong" subtitle="The two-step fix, then the human.">
          <ol className="space-y-3 px-5 py-5">
            <Step n={1}>
              Refresh the page. Changes take a minute or two to show up on other devices — yours
              shows them instantly, everyone else's after the next refresh. If The Book says it
              “couldn't confirm the board”, it is showing the last copy this phone saw; press{' '}
              <B>Retry</B> once the signal is back.
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
