/**
 * Pure formatting helpers shared by the TUI and GUI panels.
 * No JSX, no theme, no layout: only deterministic math and strings.
 */

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/** Clamps a usage percentage into 0-100; NaN becomes 0, infinities clamp. */
export function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(100, Math.max(0, value))
}

/**
 * Splits a bar of `width` cells into its filled and empty parts.
 * Filled cells use `█`, empty cells use `░`; the total is exactly `width`.
 */
export function barParts(percent: number, width: number): { filled: string; empty: string } {
  const cells = Math.floor(width)
  if (!Number.isFinite(cells) || cells <= 0) return { filled: "", empty: "" }
  const filledCount = Math.round((clampPercent(percent) / 100) * cells)
  return {
    filled: "█".repeat(filledCount),
    empty: "░".repeat(cells - filledCount),
  }
}

/** Usage tone: green below 60%, yellow 60-84.9%, red at 85% or above. */
export function toneOf(percent: number, limited?: boolean): "success" | "warning" | "error" {
  if (limited) return "error"
  const value = clampPercent(percent)
  if (value >= 85) return "error"
  if (value >= 60) return "warning"
  return "success"
}

/** Countdown to a reset: the two largest non-zero units, ASCII `d`/`h`/`m`. */
export function formatReset(resetsAt: number, now: number): string {
  const remaining = resetsAt - now
  if (!Number.isFinite(remaining) || remaining <= 0) return "now"
  if (remaining < MINUTE) return "<1m"
  const days = Math.floor(remaining / DAY)
  const hours = Math.floor((remaining % DAY) / HOUR)
  const minutes = Math.floor((remaining % HOUR) / MINUTE)
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  return `${minutes}m`
}
