'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatPoints } from '@/lib/format'

export interface PunterRow {
  id: string
  name: string
  nflTeam: string
  owner: string | null
  seasonPoints: number
  attempts: number
  average: number
  longest: number
  inside20: number
  touchbacks: number
  blocked: number
}

type SortKey =
  | 'name'
  | 'nflTeam'
  | 'owner'
  | 'seasonPoints'
  | 'attempts'
  | 'average'
  | 'longest'
  | 'inside20'
  | 'touchbacks'
  | 'blocked'

const COLUMNS: {
  key: SortKey
  label: string
  numeric: boolean
}[] = [
  { key: 'name', label: 'Punter', numeric: false },
  { key: 'nflTeam', label: 'NFL', numeric: false },
  { key: 'owner', label: 'Owner', numeric: false },
  { key: 'attempts', label: 'Att', numeric: true },
  { key: 'average', label: 'Avg', numeric: true },
  { key: 'longest', label: 'Long', numeric: true },
  { key: 'inside20', label: 'In 20', numeric: true },
  { key: 'touchbacks', label: 'TB', numeric: true },
  { key: 'blocked', label: 'Blk', numeric: true },
  { key: 'seasonPoints', label: 'Points', numeric: true },
]

export function PuntersTable({ rows }: { rows: PunterRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('seasonPoints')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') {
        return dir === 'asc' ? av - bv : bv - av
      }
      return dir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
    return copy
  }, [rows, sortKey, dir])

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setDir(key === 'name' || key === 'nflTeam' || key === 'owner' ? 'asc' : 'desc')
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((col) => {
            const active = col.key === sortKey
            return (
              <TableHead
                key={col.key}
                className={cn(col.numeric && 'text-right')}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(col.key)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    col.numeric && 'flex-row-reverse',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                  aria-label={`Sort by ${col.label}`}
                >
                  {col.label}
                  {active ? (
                    dir === 'asc' ? (
                      <ArrowUp className="size-3.5" />
                    ) : (
                      <ArrowDown className="size-3.5" />
                    )
                  ) : (
                    <ChevronsUpDown className="size-3.5 opacity-50" />
                  )}
                </button>
              </TableHead>
            )
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell>
              <Badge variant="secondary">{r.nflTeam}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {r.owner ?? 'Free agent'}
            </TableCell>
            <TableCell className="text-right font-mono">{r.attempts}</TableCell>
            <TableCell className="text-right font-mono">
              {r.average.toFixed(1)}
            </TableCell>
            <TableCell className="text-right font-mono">{r.longest}</TableCell>
            <TableCell className="text-right font-mono">{r.inside20}</TableCell>
            <TableCell className="text-right font-mono">
              {r.touchbacks}
            </TableCell>
            <TableCell className="text-right font-mono">{r.blocked}</TableCell>
            <TableCell className="text-right font-mono font-semibold">
              {formatPoints(r.seasonPoints)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
