import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ManagerLink } from '../components/profile/ManagerLink'
import { SalaryBars } from '../components/profile/SalaryBars'
import { useDocumentTitle } from '../components/profile/useDocumentTitle'
import { Chip, Empty, Hero, Panel, PageHeader } from '../components/ui'
import { useLeagueData } from '../lib/data'
import { money } from '../lib/format'
import { playerFile } from '../lib/profile-player'

/**
 * A player's file: every keeper sheet he appears on, what each owner paid,
 * and the trades that moved him. The route accepts any spelling that
 * normalises to the same name, so a link typed from memory still lands.
 */
export default function PlayerDetail() {
  const { name = '' } = useParams()
  const navigate = useNavigate()
  const data = useLeagueData()
  const decoded = useMemo(() => {
    try {
      return decodeURIComponent(name)
    } catch {
      return name
    }
  }, [name])
  const file = useMemo(() => playerFile(data, decoded), [data, decoded])
  const found = file.stints.length > 0 || file.trades.length > 0
  useDocumentTitle(found ? `${file.name} · Players · WACL League HQ` : null)

  // A way back: the page that sent us here when there is one, the manager
  // list when the link was pasted cold.
  const cameFromSite =
    typeof window !== 'undefined' && Number((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0
  const trail = (
    <nav className="pf-trail" aria-label="Breadcrumb">
      <div className="pf-trail-path">
        {cameFromSite ? (
          <button type="button" className="pf-trail-link" onClick={() => navigate(-1)}>
            Back
          </button>
        ) : (
          <Link to="/managers" className="pf-trail-link">
            Managers
          </Link>
        )}
        <span aria-hidden className="pf-trail-sep">
          ›
        </span>
        <span className="text-arc-ink-faint">Players</span>
        <span aria-hidden className="pf-trail-sep">
          ›
        </span>
        <span aria-current="page" className="pf-trail-here">
          {found ? file.name : decoded}
        </span>
      </div>
    </nav>
  )

  if (!found) {
    return (
      <div className="pf-page">
        {trail}
        <PageHeader eyebrow="Player file" title="Not found" />
        <Panel>
          <Empty>
            No roster record for “{decoded}”. Use Find (⌘K on a keyboard) to search every sheet the
            league has kept.
          </Empty>
        </Panel>
      </div>
    )
  }

  const chronological = [...file.stints].sort((a, b) => a.year - b.year)
  const seasonsOnBooks = new Set(file.stints.map((stint) => stint.year)).size
  const keptCount = file.stints.filter((stint) => stint.kept).length
  const eyebrow = [
    file.position,
    `${seasonsOnBooks} ${seasonsOnBooks === 1 ? 'season' : 'seasons'} on the books`,
    `${file.owners.length} ${file.owners.length === 1 ? 'owner' : 'owners'}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const lede = [
    file.firstSeen
      ? `On league rosters from ${file.firstSeen} to ${file.lastSeen}${
          keptCount ? `, kept ${keptCount} ${keptCount === 1 ? 'time' : 'times'}` : ''
        }.`
      : null,
    file.trades.length
      ? `Moved in ${file.trades.length} recorded ${file.trades.length === 1 ? 'trade' : 'trades'}.`
      : 'Never traded on the structured ledger.',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="pf-page">
      {trail}
      <PageHeader eyebrow={eyebrow} title={file.name} lede={lede} />

      <div className="mb-8 grid min-w-0 gap-8 lg:grid-cols-[1fr_1.1fr]">
        <Hero
          label="Peak keeper cost"
          value={money(file.peak?.cost)}
          countTo={file.peak?.cost}
          format={(value) => money(value)}
          caption={
            file.peak ? (
              <>
                The highest salary this player ever carried against a {money(data.league.baseDraftBudget)}{' '}
                auction budget: {file.peak.year}, on{' '}
                {file.peak.manager ? <ManagerLink id={file.peak.manager} /> : 'an unmapped sheet'}.
              </>
            ) : (
              'No salary recorded on any sheet.'
            )
          }
        />
        {chronological.length > 0 && (
          <div className="self-end">
            <div className="label mb-3">
              Salary by season{' '}
              <span className="normal-case tracking-normal text-arc-ink-faint">· bar colour is the owner</span>
            </div>
            <SalaryBars stints={chronological} peakYear={file.peak?.year ?? null} />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[12.5px]">
              {file.owners.map((owner) => (
                <ManagerLink key={owner} id={owner} face />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Panel title="Roster history" subtitle="Every keeper sheet this player appears on.">
          <table className="out">
            <thead>
              <tr>
                <th>Season</th>
                <th>Manager</th>
                <th className="n">Cost</th>
                <th className="n">Yr</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {file.stints.map((stint) => (
                <tr key={`${stint.year}-${stint.team}`}>
                  <td className="tnum">{stint.year}</td>
                  <td>
                    {stint.manager ? (
                      <ManagerLink id={stint.manager} face />
                    ) : (
                      <span className="text-arc-ink-soft">{stint.team}</span>
                    )}
                  </td>
                  <td className="n">{money(stint.cost)}</td>
                  <td className="n text-arc-ink-faint">{stint.contractYear ?? '—'}</td>
                  <td>{stint.kept ? <Chip tone="up">kept</Chip> : <Chip>rostered</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Trades" subtitle="Deals in the structured ledger naming this player.">
          {file.trades.length === 0 ? (
            <Empty>Never traded.</Empty>
          ) : (
            <table className="out">
              <thead>
                <tr>
                  <th>Season</th>
                  <th className="hidden sm:table-cell">Batch</th>
                  <th>From</th>
                  <th>To</th>
                  <th className="n">Total</th>
                </tr>
              </thead>
              <tbody>
                {file.trades.map((trade) => (
                  <tr key={trade.id}>
                    <td className="tnum">{trade.season}</td>
                    <td className="hidden text-arc-ink-faint sm:table-cell">{trade.batch}</td>
                    <td>
                      <ManagerLink id={trade.seller} />
                    </td>
                    <td>
                      <ManagerLink id={trade.buyer} />
                    </td>
                    <td className="n text-arc-green">{money(trade.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  )
}
