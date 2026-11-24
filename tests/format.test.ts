import { describe, expect, test } from "bun:test"
import { barParts, clampPercent, formatReset, toneOf } from "../src/lib/format"
import type { GoUsage, UsageInfo } from "../src/lib/types"
import { computeRefreshDelay } from "../src/lib/usage"

function usage(overrides: Partial<GoUsage> = {}): UsageInfo {
  const meter = (percent: number, limited = false, resetsAt = 1_000_000_000 + 3 * 3_600_000) => ({
    percent,
    limited,
    resetsAt,
  })
  return {
    workspace: { id: "ws", usageURL: "https://opencode.ai/usage" },
    go: {
      rolling: meter(0),
      weekly: meter(11),
      monthly: meter(96),
      ...overrides,
    },
    budgets: [],
  }
}

describe("clampPercent", () => {
  test("clamps out-of-range values and maps non-finite input to 0", () => {
    expect(clampPercent(-10)).toBe(0)
    expect(clampPercent(0)).toBe(0)
    expect(clampPercent(42.5)).toBe(42.5)
    expect(clampPercent(100)).toBe(100)
    expect(clampPercent(150)).toBe(100)
    expect(clampPercent(Number.NaN)).toBe(0)
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(100)
  })
})

describe("barParts", () => {
  const cases: Array<{ percent: number; width: number; filled: number }> = [
    { percent: 0, width: 10, filled: 0 },
    { percent: 11, width: 10, filled: 1 },
    { percent: 50, width: 10, filled: 5 },
    { percent: 96, width: 10, filled: 10 },
    { percent: 100, width: 10, filled: 10 },
    { percent: 150, width: 10, filled: 10 },
  ]

  test.each(cases)("percent $percent at width $width fills $filled cells", ({ percent, width, filled }) => {
    const parts = barParts(percent, width)
    expect(parts.filled.length).toBe(filled)
    expect(parts.empty.length).toBe(width - filled)
    expect(parts.filled).toBe("█".repeat(filled))
    expect(parts.empty).toBe("░".repeat(width - filled))
  })

  test("non-positive widths produce no cells", () => {
    expect(barParts(50, 0)).toEqual({ filled: "", empty: "" })
    expect(barParts(50, -1)).toEqual({ filled: "", empty: "" })
  })
})

describe("toneOf", () => {
  test("switches at the documented boundaries", () => {
    expect(toneOf(0)).toBe("success")
    expect(toneOf(59.9)).toBe("success")
    expect(toneOf(60)).toBe("warning")
    expect(toneOf(84.9)).toBe("warning")
    expect(toneOf(85)).toBe("error")
    expect(toneOf(100)).toBe("error")
  })

  test("limited always forces error", () => {
    expect(toneOf(0, true)).toBe("error")
    expect(toneOf(60, true)).toBe("error")
  })
})

describe("formatReset", () => {
  const now = 1_000_000_000

  test("past resets read as now", () => {
    expect(formatReset(now, now)).toBe("now")
    expect(formatReset(now - 1, now)).toBe("now")
  })

  test("uses the two largest units", () => {
    expect(formatReset(now + 2 * 86_400_000 + 4 * 3_600_000, now)).toBe("2d 4h")
    expect(formatReset(now + 3 * 3_600_000 + 12 * 60_000, now)).toBe("3h 12m")
    expect(formatReset(now + 12 * 60_000, now)).toBe("12m")
    expect(formatReset(now + 5 * 3_600_000, now)).toBe("5h")
    expect(formatReset(now + 2 * 86_400_000, now)).toBe("2d")
  })

  test("sub-minute resets stay short", () => {
    expect(formatReset(now + 30_000, now)).toBe("<1m")
  })
})

describe("computeRefreshDelay", () => {
  const now = 1_000_000_000

  test("polls every 60s when healthy", () => {
    expect(computeRefreshDelay(usage(), now)).toBe(60_000)
    expect(computeRefreshDelay(undefined, now)).toBe(60_000)
  })

  test("polls every 5s when any window is limited", () => {
    const info = usage({ weekly: { percent: 100, limited: true, resetsAt: now + 3_600_000 } })
    expect(computeRefreshDelay(info, now)).toBe(5_000)
  })

  test("polls every 5s when a window resets within a second", () => {
    const due = usage({ monthly: { percent: 96, limited: false, resetsAt: now + 1_000 } })
    const later = usage({ monthly: { percent: 96, limited: false, resetsAt: now + 1_001 } })
    expect(computeRefreshDelay(due, now)).toBe(5_000)
    expect(computeRefreshDelay(later, now)).toBe(60_000)
  })

  test("go missing falls back to the normal delay", () => {
    const info: UsageInfo = {
      workspace: { id: "ws", usageURL: "https://opencode.ai/usage" },
      budgets: [],
    }
    expect(computeRefreshDelay(info, now)).toBe(60_000)
  })
})
