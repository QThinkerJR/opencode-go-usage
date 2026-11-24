/**
 * Solid DOM panel for the OpenCode Desktop side region.
 * Pure props: the host owns state, time and refresh; this file owns only the view.
 */
import { createMemo, For, Index, Show } from "solid-js"
import type { JSX } from "solid-js"
import { clampPercent, formatReset, toneOf } from "../lib/format"
import type { GoUsage, Meter, UsageInfo, UsageState } from "../lib/types"

export interface GuiUsagePanelProps {
  readonly state: UsageState
  readonly now: number
  readonly onRefresh: () => void
}

type MeterTone = ReturnType<typeof toneOf>

interface WindowSpec {
  readonly key: keyof GoUsage
  readonly label: string
  readonly aria: string
}

interface MeterRow {
  readonly label: string
  readonly aria: string
  readonly percent: number
  readonly tone: MeterTone
  readonly limited: boolean
  readonly resetsAt: number
}

interface PanelNotice {
  readonly tone: "error" | "plain"
  readonly title: string
  readonly detail?: string
}

const TITLE = "OpenCode Go"
const LOADING_TEXT = "Loading Go usage…"
const UNAVAILABLE_TEXT = "Usage unavailable"
const SIGNED_OUT_TEXT = "Sign in to OpenCode Console"
const NO_GO_TEXT = "No Go subscription"

const WINDOWS: readonly WindowSpec[] = [
  { key: "rolling", label: "5h", aria: "5-hour window usage" },
  { key: "weekly", label: "Weekly", aria: "Weekly usage" },
  { key: "monthly", label: "Monthly", aria: "Monthly usage" },
]

/** Last known snapshot: ready data, or the previous data kept by a failed refresh. */
function lastInfo(state: UsageState): UsageInfo | undefined {
  if (state.status === "ready") return state.info
  if (state.status === "error") return state.previous
  return undefined
}

/** A stale marker means "these numbers are the last known ones", never an empty guess. */
function isStale(state: UsageState): boolean {
  if (state.status === "ready") return state.stale
  if (state.status === "error") return state.previous !== undefined
  return false
}

function oneLine(text: string | undefined): string | undefined {
  const value = text?.replace(/\s+/g, " ").trim()
  return value ? value : undefined
}

/** "Resets in 3h 12m" / "Resets now"; unknown timestamps render nothing. */
function resetLabel(resetsAt: number, now: number): string | undefined {
  if (!Number.isFinite(resetsAt) || resetsAt <= 0) return undefined
  const value = formatReset(resetsAt, now)
  return value === "now" ? "Resets now" : `Resets in ${value}`
}

function buildRows(go: GoUsage | undefined): MeterRow[] {
  if (!go) return []
  return WINDOWS.map((spec) => {
    const meter: Meter = go[spec.key]
    const used = clampPercent(meter.percent)
    const percent = Math.round(used)
    return {
      label: spec.label,
      aria: spec.aria,
      percent,
      tone: toneOf(used, meter.limited),
      limited: meter.limited,
      resetsAt: meter.resetsAt,
    }
  })
}

function MeterRowView(props: { readonly row: MeterRow; readonly now: number }): JSX.Element {
  const resets = createMemo(() => resetLabel(props.row.resetsAt, props.now))

  return (
    <div class="ogu-meter">
      <div class="ogu-meter-head">
        <span class="ogu-label">{props.row.label}</span>
        <Show when={props.row.limited}>
          <span class="ogu-badge ogu-badge--limited">LIMITED</span>
        </Show>
        <span class="ogu-percent" classList={{ "ogu-percent--limited": props.row.limited }}>
          {props.row.percent}%
        </span>
      </div>
      <div
        class="ogu-track"
        role="progressbar"
        aria-label={props.row.aria}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={props.row.percent}
        aria-valuetext={`${props.row.percent}% used`}
      >
        <span
          class={`ogu-fill ogu-fill--${props.row.tone}`}
          style={{ width: `${props.row.percent}%` }}
          aria-hidden="true"
        />
      </div>
      <div class="ogu-meter-foot">
        <span class="ogu-reset">{resets() ?? ""}</span>
      </div>
    </div>
  )
}

function RefreshIcon(): JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  )
}

/**
 * Narrow side-panel surface: one header (title, refresh), then the three Go
 * windows as a label/percent line, a used-percent bar and a reset countdown.
 * Every state keeps the same row geometry so the panel never jumps.
 */
export function GuiUsagePanel(props: GuiUsagePanelProps): JSX.Element {
  const loading = () => props.state.status === "loading"
  const stale = createMemo(() => isStale(props.state))
  const rows = createMemo(() => buildRows(lastInfo(props.state)?.go))

  const notice = createMemo<PanelNotice | undefined>(() => {
    const state = props.state
    if (state.status === "loading") return undefined
    if (state.status === "error") {
      return { tone: "error", title: UNAVAILABLE_TEXT, detail: oneLine(state.message) }
    }
    if (state.status === "empty") {
      return {
        tone: "plain",
        title: state.reason === "signed-out" ? SIGNED_OUT_TEXT : NO_GO_TEXT,
      }
    }
    return lastInfo(state)?.go ? undefined : { tone: "plain", title: NO_GO_TEXT }
  })

  return (
    <section data-ogu-root="" data-ogu-state={props.state.status} class="ogu-root" aria-label="OpenCode Go usage">
      <header class="ogu-header">
        <div class="ogu-header-top">
          <div class="ogu-heading">
            <h2 class="ogu-title">{TITLE}</h2>
            <Show when={stale()}>
              <span class="ogu-badge ogu-badge--stale" title="Showing the last known usage">
                stale
              </span>
            </Show>
          </div>
          <button
            type="button"
            class="ogu-refresh"
            classList={{ "ogu-refresh--busy": loading() }}
            aria-label="Refresh usage"
            title="Refresh usage"
            disabled={loading()}
            onClick={() => props.onRefresh()}
          >
            <RefreshIcon />
          </button>
        </div>
      </header>

      <div class="ogu-body">
        <Show when={loading()}>
          <div class="ogu-skeleton" role="status" aria-live="polite">
            <span class="ogu-sr-only">{LOADING_TEXT}</span>
            <For each={WINDOWS}>
              {(spec) => (
                <div class="ogu-meter" aria-hidden="true">
                  <div class="ogu-meter-head">
                    <span class="ogu-label ogu-label--loading">{spec.label}</span>
                    <span class="ogu-skel ogu-skel--percent" />
                  </div>
                  <div class="ogu-track ogu-track--skeleton">
                    <span class="ogu-skel ogu-skel--fill" />
                  </div>
                  <div class="ogu-meter-foot">
                    <span class="ogu-skel ogu-skel--reset" />
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={!loading()}>
          <Show when={notice()}>
            {(current) => (
              <div
                class="ogu-notice"
                classList={{ "ogu-notice--error": current().tone === "error" }}
                role={current().tone === "error" ? "alert" : "status"}
              >
                <span class="ogu-notice-title">{current().title}</span>
                <Show when={current().detail}>
                  {(detail) => <span class="ogu-notice-detail">{detail()}</span>}
                </Show>
              </div>
            )}
          </Show>

          <Show when={rows().length > 0}>
            <div class="ogu-meters">
              <Index each={rows()}>{(row) => <MeterRowView row={row()} now={props.now} />}</Index>
            </div>
          </Show>
        </Show>
      </div>
    </section>
  )
}
