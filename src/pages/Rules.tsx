import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { Panel, PageHeader, SectionNav, Stat } from '../components/ui'
import { useLeagueData } from '../lib/data'
import { money } from '../lib/format'
import { animationsDisabled } from '../lib/motion'

/**
 * The workbook's rule sheet is a flat list. Bullets are clauses; a short
 * line, or one ending in a colon, is a heading; anything else runs on from
 * the bullet above it and hangs there. Two of the headings are where the
 * constitution changes subject, so the list is cut into three sections and
 * each gets its explainer beside it.
 */
type Kind = 'bullet' | 'heading' | 'note' | 'cont'

function classify(line: string): { kind: Kind; text: string } {
  if (line.startsWith('-')) return { kind: 'bullet', text: line.replace(/^-\s*/, '') }
  if (line.length < 40 || /:\s*\*?$/.test(line)) return { kind: 'heading', text: line }
  if (/^[(*]/.test(line)) return { kind: 'note', text: line }
  return { kind: 'cont', text: line }
}

function RuleList({ lines }: { lines: string[] }) {
  return (
    <ul className="space-y-3 px-5 py-5">
      {lines.map((line, index) => {
        const { kind, text } = classify(line)
        if (kind === 'bullet')
          return (
            <li key={index} className="flex gap-3 text-[13px] leading-relaxed text-arc-ink-soft">
              <span aria-hidden className="mt-2 h-px w-3 shrink-0 bg-arc-lime" />
              <span>{text}</span>
            </li>
          )
        if (kind === 'heading')
          return (
            <li key={index} className="rule-heading">
              {text.replace(/\s*\*$/, '')}
            </li>
          )
        return (
          <li key={index} className={kind === 'note' ? 'rule-note' : 'rule-cont'}>
            {text}
          </li>
        )
      })}
    </ul>
  )
}

const SECTIONS = [
  { id: 'keepers', label: 'Keepers' },
  { id: 'waivers', label: 'Waivers' },
  { id: 'anti-dumping', label: 'Anti-dumping' },
]

export default function Rules() {
  const { rules, league } = useLeagueData()
  const { hash } = useLocation()

  const { keepers, waivers, antiDumping } = useMemo(() => {
    const body = rules.filter(
      (line) => line !== league.name && !line.startsWith('Official Keeper Rules'),
    )
    const faabAt = body.findIndex((line) => /FAAB Budget/i.test(line))
    const dumpAt = body.findIndex((line) => /^Anti-Dumping Rule/i.test(line))
    const cutA = faabAt >= 0 ? faabAt : body.length
    const cutB = dumpAt >= 0 && dumpAt > cutA ? dumpAt : body.length
    return {
      keepers: body.slice(0, cutA),
      waivers: body.slice(cutA, cutB),
      antiDumping: body.slice(cutB),
    }
  }, [rules, league.name])

  // /rules#anti-dumping from the trade desk lands on the rule it enforces.
  useEffect(() => {
    const id = hash.replace(/^#/, '')
    if (!id) return
    const node = document.getElementById(id)
    node?.scrollIntoView({ block: 'start', behavior: animationsDisabled() ? 'auto' : 'smooth' })
  }, [hash])

  return (
    <>
      <PageHeader
        path="~/rules"
        eyebrow="Constitution"
        title="Rules"
        lede="The official keeper rules as maintained by the commissioner, reproduced verbatim from the league workbook."
      />

      <SectionNav sections={SECTIONS} />

      <div className="line-in mb-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat label="Keeper slots" value={league.keeperSlots} hint="Per team, since 2016" />
        <Stat label="Max contract" value={`${league.maxContractYears} yrs`} hint="Years A → D, since 2018" />
        <Stat label="Auction budget" value={money(league.baseDraftBudget)} hint="Less keeper salaries" />
        <Stat
          label="Waiver budget"
          value={money(league.baseFaabBudget)}
          hint="Per team per season, tracked in Yahoo"
        />
      </div>

      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-2">
        <Panel
          id="keepers"
          title="Keeper rules"
          subtitle="Slots, contracts, and what a kept player costs. Verbatim."
          delay={60}
        >
          <RuleList lines={keepers} />
        </Panel>

        <div className="space-y-6">
          <Panel
            id="waivers"
            title="Waivers and the keeper scale"
            subtitle="Weekly waivers run in Yahoo; this scale sets what a pickup costs to keep next season."
            delay={100}
          >
            {waivers.length > 0 && <RuleList lines={waivers} />}
            <table className="out">
              <thead>
                <tr>
                  <th>% of waiver budget spent</th>
                  <th className="n">Keeper cost</th>
                </tr>
              </thead>
              <tbody>
                {league.faabScale.map((tier, index) => {
                  const from = index === 0 ? 0 : league.faabScale[index - 1].maxPct + 1
                  return (
                    <tr key={tier.maxPct}>
                      <td className="tnum">
                        {index === league.faabScale.length - 1
                          ? `> ${league.faabScale[index - 1].maxPct}%`
                          : `${from}–${tier.maxPct}%`}
                      </td>
                      <td className="n text-arc-green">{money(tier.keeperCost)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="border-t border-arc-line px-5 py-3.5 text-[12px] leading-relaxed text-arc-ink-faint">
              A player drafted in the auction and later re-acquired off waivers keeps the greater of
              the auction value and the waiver-scale cost. Undrafted free agents cost $5.
            </p>
          </Panel>

          <Panel
            id="anti-dumping"
            title="Anti-dumping and the market check"
            subtitle="Checked automatically on every trade in the queue."
            delay={140}
          >
            {antiDumping.length > 0 && <RuleList lines={antiDumping} />}
            <div className="space-y-3 border-t border-arc-line px-5 py-5 text-[13px] leading-relaxed text-arc-ink-soft">
              <p className="label">How the site applies it</p>
              <p>
                A trade moving less than <span className="text-arc-green">$10</span> in the
                subsequent year can be held 24 hours for a market check. By the rule's own example,
                a $5/$10 trade triggers it and a $10/$2 trade does not — the test is the first
                obligation year, not the total. The trade desk flags a qualifying trade on its own
                and offers the commissioner the hold.
              </p>
              <p className="text-arc-ink-faint">
                During the window any manager may offer the seller a better proposal. When it
                closes, the seller owes the original buyer a right of first refusal before dealing
                elsewhere.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}
