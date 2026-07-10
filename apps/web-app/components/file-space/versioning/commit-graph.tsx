import { useMemo } from "react"

import { cn } from "@/lib/utils"
import type { SpaceVersionCommit } from "@/apps/web-app/hooks/use-space-versioning"

const LANE_COLORS = [
  "var(--primary)",
  "#e26a8d",
  "#36a57c",
  "#d58a2b",
  "#5e8fd8",
  "#9a72cf",
  "#3b9ba5",
]

export interface CommitGraphRow {
  commit: SpaceVersionCommit
  lane: number
  hasIncoming: boolean
  lanesBefore: string[]
  lanesAfter: string[]
  maxLane: number
}

function uniqueLanes(lanes: string[]) {
  return lanes.filter((lane, index) => lane && lanes.indexOf(lane) === index)
}

export function buildCommitGraphRows(
  commits: SpaceVersionCommit[]
): CommitGraphRow[] {
  let activeLanes: string[] = []
  let maximumLane = 0
  const rows: CommitGraphRow[] = []

  for (const commit of commits) {
    let lanesBefore = [...activeLanes]
    let lane = lanesBefore.indexOf(commit.id)
    const hasIncoming = lane >= 0
    if (lane < 0) {
      lane = lanesBefore.length
      lanesBefore.push(commit.id)
    }

    const lanesAfter = [...lanesBefore]
    if (commit.parents.length === 0) {
      lanesAfter.splice(lane, 1)
    } else {
      const [firstParent, ...otherParents] = commit.parents
      const existingFirstParent = lanesAfter.indexOf(firstParent)
      if (existingFirstParent >= 0 && existingFirstParent !== lane) {
        lanesAfter.splice(lane, 1)
      } else {
        lanesAfter[lane] = firstParent
      }

      let insertionPoint = Math.min(lane + 1, lanesAfter.length)
      for (const parent of otherParents) {
        if (lanesAfter.includes(parent)) continue
        lanesAfter.splice(insertionPoint, 0, parent)
        insertionPoint += 1
      }
    }

    const dedupedAfter = uniqueLanes(lanesAfter)
    maximumLane = Math.max(maximumLane, lanesBefore.length, dedupedAfter.length)
    rows.push({
      commit,
      lane,
      hasIncoming,
      lanesBefore,
      lanesAfter: dedupedAfter,
      maxLane: maximumLane,
    })
    activeLanes = dedupedAfter
  }

  return rows.map((row) => ({ ...row, maxLane: maximumLane }))
}

function laneX(lane: number) {
  return 10 + lane * 12
}

function laneColor(lane: number) {
  return LANE_COLORS[lane % LANE_COLORS.length]
}

export function CommitGraphCell({
  row,
  width,
  className,
}: {
  row: CommitGraphRow
  width: number
  className?: string
}) {
  const { commit, lane, hasIncoming, lanesBefore, lanesAfter } = row
  const paths = useMemo(() => {
    const segments: Array<{
      key: string
      d: string
      color: string
      opacity?: number
    }> = []
    const nodeX = laneX(lane)
    const centerY = 19

    for (
      let beforeIndex = 0;
      beforeIndex < lanesBefore.length;
      beforeIndex += 1
    ) {
      const laneId = lanesBefore[beforeIndex]
      if (laneId === commit.id) continue
      const afterIndex = lanesAfter.indexOf(laneId)
      if (afterIndex < 0) continue
      const startX = laneX(beforeIndex)
      const endX = laneX(afterIndex)
      segments.push({
        key: `pass:${laneId}:${beforeIndex}:${afterIndex}`,
        d:
          startX === endX
            ? `M ${startX} 0 L ${endX} 38`
            : `M ${startX} 0 C ${startX} 18, ${endX} 20, ${endX} 38`,
        color: laneColor(beforeIndex),
        opacity: 0.72,
      })
    }

    if (hasIncoming) {
      segments.push({
        key: `incoming:${commit.id}`,
        d: `M ${nodeX} 0 L ${nodeX} ${centerY}`,
        color: laneColor(lane),
      })
    }

    for (const parent of commit.parents) {
      const parentLane = lanesAfter.indexOf(parent)
      if (parentLane < 0) continue
      const endX = laneX(parentLane)
      segments.push({
        key: `parent:${commit.id}:${parent}`,
        d:
          nodeX === endX
            ? `M ${nodeX} ${centerY} L ${endX} 38`
            : `M ${nodeX} ${centerY} C ${nodeX} 29, ${endX} 28, ${endX} 38`,
        color: laneColor(parentLane),
      })
    }
    return segments
  }, [commit.id, commit.parents, hasIncoming, lane, lanesAfter, lanesBefore])

  return (
    <svg
      className={cn("block h-[38px] shrink-0 overflow-visible", className)}
      width={width}
      height={38}
      viewBox={`0 0 ${width} 38`}
      aria-hidden="true"
    >
      {paths.map((path) => (
        <path
          key={path.key}
          d={path.d}
          fill="none"
          stroke={path.color}
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity={path.opacity}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <circle
        cx={laneX(lane)}
        cy="19"
        r="4.25"
        fill="var(--background)"
        stroke={laneColor(lane)}
        strokeWidth="2"
      />
      <circle cx={laneX(lane)} cy="19" r="1.25" fill={laneColor(lane)} />
    </svg>
  )
}

export function commitGraphWidth(rows: CommitGraphRow[]) {
  const lanes = Math.max(1, rows[0]?.maxLane ?? 1)
  return Math.max(34, 20 + lanes * 12)
}
