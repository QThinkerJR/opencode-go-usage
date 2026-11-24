/** @jsxImportSource @opentui/solid */
import { createMemo, For, Show } from "solid-js"
import type { JSX } from "@opentui/solid"
import { barParts, clampPercent, formatReset, toneOf } from "../lib/format"
import type { GoUsage, Meter, UsageInfo, UsageState } from "../lib/types"
import { resolveTuiPalette, type TuiThemeTokens } from "./theme"

export interface TuiUsagePanelProps {
  readonly state: UsageState
  readonly theme: TuiThemeTokens
  readonly width: number
}

/**
 * Column budget in terminal cells. The bar takes whatever the fixed columns do
 * not need, so every rendered line ends exactly at the measured width; 36 cells
 * is the reference sidebar width.
 */
const LABEL_CELLS = 7 // "Monthly"
const PERCENT_CELLS = 4 // "100%"
const LIMITED_CELLS = 7 // "LIMITED"
const RESET_CELLS = 7 // "23h 59m"
const MIN_BAR_CELLS = 6
const GAP_CELLS = 1
const REFERENCE_WIDTH = 36
const NARROWEST_WIDTH = 24

const ELLIPSIS = "…"
const TITLE = "OpenCode Go"
const STALE_MARKER = "stale"

const LOADING_TEXT = "Loading Go usage…"
const SIGNED_OUT_TEXT = "Sign in to OpenCode Console"
const NO_GO_TEXT = "No Go subscription"
const UNAVAILABLE_TEXT = "Usage unavailable"

type MeterTone = ReturnType<typeof toneOf>

interface MeterRow {
  readonly label: string
  readonly limited: boolean
  readonly tone: MeterTone
  readonly filled: string
  readonly empty: string
  readonly percent: string
  readonly reset: string
}

interface PanelNotice {
  readonly text: string
  readonly detail?: string
  readonly tone: "error" | "plain"
}

/**
 * Terminals draw East Asian characters and emoji two cells wide. Counting cells
 * rather than code points is what keeps clipped text inside the sidebar edge.
 */
function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  )
}

function charCells(char: string): number {
  const code = char.codePointAt(0) ?? 0
  if (code === 0x200d || (code >= 0x0300 && code <= 0x036f)) return 0
  return isWide(code) ? 2 : 1
}

function cellWidth(text: string): number {
  let cells = 0
  for (const char of text) cells += charCells(char)
  return cells
}

/** Cuts text to at most `maxCells` cells and marks the cut with an ellipsis. */
function clip(text: string, maxCells: number): string {
  if (maxCells <= 0) return ""
  if (cellWidth(text) <= maxCells) return text
  let out = ""
  let used = 0
  for (const char of text) {
    const cells = charCells(char)
    if (used + cells > maxCells - 1) break
    out += char
    used += cells
  }
  return `${out.trimEnd()}${ELLIPSIS}`
}

/** Collapses newlines and repeated spaces so text stays on one line. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function layoutWidth(requested: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return REFERENCE_WIDTH
  return Math.max(NARROWEST_WIDTH, Math.round(requested))
}

/** Reads as "in N"; drops to the largest unit when the column is too narrow. */
function fitReset(resetsAt: number, now: number, maxCells: number): string {
  if (!Number.isFinite(resetsAt) || resetsAt <= 0) return ""
  const full = formatReset(resetsAt, now)
  if (cellWidth(full) <= maxCells) return full
  const coarse = full.split(" ")[0] ?? full
  return cellWidth(coarse) <= maxCells ? coarse : clip(coarse, maxCells)
}

/**
 * Sidebar panel: one accent title line, then one aligned row per Go window
 * (label, used bar, used percent, reset countdown). Pure props by design — the
 * host measures the width and owns loading/refresh.
 */
export function TuiUsagePanel(props: TuiUsagePanelProps): JSX.Element {
  const palette = createMemo(() => resolveTuiPalette(props.theme))

  const info = createMemo<UsageInfo | undefined>(() => {
    const state = props.state
    if (state.status === "ready") return state.info
    if (state.status === "error") return state.previous
    return undefined
  })

  const go = createMemo<GoUsage | undefined>(() => info()?.go)

  const limitedMode = createMemo(() => {
    const usage = go()
    if (!usage) return false
    return usage.rolling.limited || usage.weekly.limited || usage.monthly.limited
  })

  // Every row shares the same columns, so a single limited window widens the
  // percent column for all rows instead of breaking the bar alignment.
  const metrics = createMemo(() => {
    const width = layoutWidth(props.width)
    const percentCells = limitedMode() ? LIMITED_CELLS : PERCENT_CELLS
    const fixedCells = LABEL_CELLS + percentCells + GAP_CELLS * 3
    const resetCells = Math.min(RESET_CELLS, Math.max(3, width - fixedCells - MIN_BAR_CELLS))
    return {
      width,
      percentCells,
      resetCells,
      barCells: Math.max(3, width - fixedCells - resetCells),
    }
  })

  const stale = createMemo(() => {
    const state = props.state
    if (state.status === "ready") return state.stale
    if (state.status === "error") return state.previous !== undefined
    return false
  })

  const header = createMemo(() => {
    const width = metrics().width
    const marker = stale() ? STALE_MARKER : ""
    const filler = marker ? " ".repeat(Math.max(1, width - cellWidth(TITLE) - cellWidth(marker))) : ""
    return { filler, marker }
  })

  const notice = createMemo<PanelNotice | undefined>(() => {
    const state = props.state
    if (state.status === "loading") return undefined
    if (state.status === "error") {
      const detail = oneLine(state.message)
      return { text: UNAVAILABLE_TEXT, detail: detail || undefined, tone: "error" }
    }
    if (state.status === "empty") {
      return {
        text: state.reason === "signed-out" ? SIGNED_OUT_TEXT : NO_GO_TEXT,
        tone: "plain",
      }
    }
    return go() ? undefined : { text: NO_GO_TEXT, tone: "plain" }
  })

  const rows = createMemo<MeterRow[]>(() => {
    const usage = go()
    if (!usage) return []
    const { barCells, resetCells } = metrics()
    const now = Date.now()

    const build = (label: string, meter: Meter): MeterRow => {
      const percent = clampPercent(meter.percent)
      const parts = barParts(percent, barCells)
      return {
        label,
        limited: meter.limited,
        tone: toneOf(percent, meter.limited),
        filled: parts.filled,
        empty: parts.empty,
        percent: meter.limited ? "LIMITED" : `${Math.round(percent)}%`,
        reset: fitReset(meter.resetsAt, now, resetCells),
      }
    }

    return [build("5h", usage.rolling), build("Weekly", usage.weekly), build("Monthly", usage.monthly)]
  })

  const toneColor = (tone: MeterTone) => {
    const colors = palette()
    if (tone === "success") return colors.success
    if (tone === "warning") return colors.warning
    return colors.error
  }

  return (
    <box flexDirection="column" width="100%">
      <text width="100%" height={1} wrapMode="none" selectable={false} truncate>
        <span style={{ fg: palette().accent, bold: true }}>{TITLE}</span>
        <span>{header().filler}</span>
        <span style={{ fg: palette().muted }}>{header().marker}</span>
      </text>

      {/* Text states get a title gap; the meter rows sit flush to stay compact. */}
      <Show when={props.state.status === "loading" || notice() !== undefined}>
        <box height={1} />
      </Show>

      <Show when={props.state.status === "loading"}>
        <text width="100%" height={1} wrapMode="none" selectable={false} truncate>
          <span style={{ fg: palette().muted }}>{LOADING_TEXT}</span>
        </text>
      </Show>

      <Show when={notice()}>
        {(current) => (
          <text width="100%" height={1} wrapMode="none" selectable={false} truncate>
            <span
              style={{
                fg: current().tone === "error" ? palette().error : palette().text,
                bold: current().tone === "error",
              }}
            >
              {clip(current().text, metrics().width)}
            </span>
          </text>
        )}
      </Show>

      <Show when={notice()?.detail}>
        <text width="100%" height={1} wrapMode="none" selectable={false} truncate>
          <span style={{ fg: palette().muted }}>{clip(notice()?.detail ?? "", metrics().width)}</span>
        </text>
      </Show>

      <Show when={notice() !== undefined && rows().length > 0}>
        <box height={1} />
      </Show>

      <For each={rows()}>
        {(row) => (
          <text width="100%" height={1} wrapMode="none" selectable={false} truncate>
            <span style={{ fg: palette().muted }}>{`${row.label.padEnd(LABEL_CELLS)} `}</span>
            <span style={{ fg: toneColor(row.tone) }}>{row.filled}</span>
            <span style={{ fg: palette().muted }}>{row.empty}</span>
            <span style={{ fg: row.limited ? palette().error : palette().text, bold: row.limited }}>
              {` ${row.percent.padStart(metrics().percentCells)}`}
            </span>
            <span style={{ fg: palette().muted }}>{` ${row.reset.padStart(metrics().resetCells)}`}</span>
          </text>
        )}
      </For>
    </box>
  )
}
