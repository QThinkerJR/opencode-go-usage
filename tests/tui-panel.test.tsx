/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import { TuiUsagePanel } from "../src/tui/panel"
import { resolveTuiPalette } from "../src/tui/theme"
import type { UsageInfo, UsageState } from "../src/lib/types"

type PanelTheme = Parameters<typeof TuiUsagePanel>[0]["theme"]

const WIDTH = 36
const HEIGHT = 20
const HOUR = 3_600_000
const DAY = 86_400_000

/** Minimal token mock; the panel only paints with these values. */
function mockTheme(): PanelTheme {
  const base = RGBA.fromHex("#d4d4d4")
  const muted = RGBA.fromHex("#808080")
  const success = RGBA.fromHex("#3fb950")
  const warning = RGBA.fromHex("#d29922")
  const error = RGBA.fromHex("#f85149")
  return {
    text: {
      base,
      muted,
      feedback: {
        success: { base: success },
        warning: { base: warning },
        error: { base: error },
      },
    },
    hue: { accent: { 500: base } },
  }
}

function readyState(now: number): UsageState {
  const info: UsageInfo = {
    workspace: { id: "ws_test", name: "Test", usageURL: "https://opencode.ai/usage" },
    go: {
      rolling: { percent: 0, limited: false, resetsAt: now + 5 * HOUR },
      weekly: { percent: 11, limited: false, resetsAt: now + 2 * DAY + 4 * HOUR },
      monthly: { percent: 96, limited: false, resetsAt: now + 3 * HOUR + 12 * 60_000 },
    },
    budgets: [],
  }
  return { status: "ready", info, updatedAt: now, stale: false }
}

async function frameOf(state: UsageState): Promise<string[]> {
  const setup = await testRender(() => <TuiUsagePanel state={state} theme={mockTheme()} width={WIDTH} />, {
    width: WIDTH,
    height: HEIGHT,
  })
  try {
    await setup.renderOnce()
    return setup.captureCharFrame().split("\n")
  } finally {
    await setup.dispose()
  }
}

function barCells(line: string): { filled: number; empty: number } {
  return {
    filled: Array.from(line).filter((char) => char === "█").length,
    empty: Array.from(line).filter((char) => char === "░").length,
  }
}

describe("TuiUsagePanel", () => {
  test("resolves nested feedback colors and falls back to base text", () => {
    const palette = resolveTuiPalette(mockTheme())
    expect(palette.success).not.toBe(palette.text)
    expect(palette.warning).not.toBe(palette.text)
    expect(palette.error).not.toBe(palette.text)

    const fallback = resolveTuiPalette({ text: { base: palette.text } })
    expect(fallback.success).toBe(palette.text)
    expect(fallback.warning).toBe(palette.text)
    expect(fallback.error).toBe(palette.text)
  })

  test("renders three meters in a 36-column frame", async () => {
    const lines = await frameOf(readyState(Date.now()))
    const frame = lines.join("\n")

    expect(frame).toContain("5h")
    expect(frame).toContain("Weekly")
    expect(frame).toContain("Monthly")
    expect(frame).toContain("11%")
    expect(frame).toContain("96%")

    for (const line of lines) {
      expect(Array.from(line).length).toBeLessThanOrEqual(WIDTH)
    }
  })

  test("header names only the panel, not the workspace", async () => {
    const lines = await frameOf(readyState(Date.now()))
    expect(lines[0]?.trim()).toBe("OpenCode Go")
  })

  test("keeps window rows compact", async () => {
    const lines = await frameOf(readyState(Date.now()))
    const rollingIndex = lines.findIndex((line) => /^5h\s/.test(line))
    const weeklyIndex = lines.findIndex((line) => line.includes("Weekly"))
    const monthlyIndex = lines.findIndex((line) => line.includes("Monthly"))

    expect(rollingIndex).toBeGreaterThanOrEqual(0)
    expect(weeklyIndex).toBe(rollingIndex + 1)
    expect(monthlyIndex).toBe(rollingIndex + 2)
  })

  test("monthly bar fills round(96% * width) cells", async () => {
    const lines = await frameOf(readyState(Date.now()))

    const monthlyIndex = lines.findIndex((line) => line.includes("Monthly"))
    expect(monthlyIndex).toBeGreaterThanOrEqual(0)

    // The bar can sit on the label line or on a row right below it.
    const nearby = lines.slice(monthlyIndex, monthlyIndex + 3)
    const barLine = nearby.find((line) => /[█░]/.test(line))
    expect(barLine).toBeDefined()

    const { filled, empty } = barCells(barLine!)
    const barWidth = filled + empty
    expect(barWidth).toBeGreaterThan(0)
    expect(filled).toBe(Math.round((96 / 100) * barWidth))
  })

  test("limited meters show LIMITED and keep the frame width", async () => {
    const now = Date.now()
    const state: UsageState = {
      status: "ready",
      updatedAt: now,
      stale: false,
      info: {
        workspace: { id: "ws_test", name: "Test", usageURL: "https://opencode.ai/usage" },
        go: {
          rolling: { percent: 100, limited: true, resetsAt: now + 44 * 60_000 },
          weekly: { percent: 44, limited: false, resetsAt: now + 2 * DAY },
          monthly: { percent: 96, limited: false, resetsAt: now + 3 * HOUR },
        },
        budgets: [],
      },
    }
    const lines = await frameOf(state)
    const frame = lines.join("\n")
    expect(frame).toContain("LIMITED")
    expect(frame).toContain("44%")
    for (const line of lines) {
      expect(Array.from(line).length).toBeLessThanOrEqual(WIDTH)
    }
  })

  test("ready stale data carries a stale marker", async () => {
    const base = readyState(Date.now())
    const state: UsageState =
      base.status === "ready" ? { ...base, stale: true } : base
    const frame = (await frameOf(state)).join("\n")
    expect(frame).toContain("stale")
  })

  test("empty no-go and signed-out states name the reason", async () => {
    const noGo = (await frameOf({ status: "empty", reason: "no-go" })).join("\n")
    expect(noGo).toContain("No Go subscription")
    const signedOut = (await frameOf({ status: "empty", reason: "signed-out" })).join("\n")
    expect(signedOut).toContain("Sign in to OpenCode Console")
  })

  test("error state keeps the panel within the width", async () => {
    const lines = await frameOf({ status: "error", message: "usage unavailable" })
    const frame = lines.join("\n")

    expect(frame).toContain("usage unavailable")
    for (const line of lines) {
      expect(Array.from(line).length).toBeLessThanOrEqual(WIDTH)
    }
  })

  test("empty state keeps the panel within the width", async () => {
    const lines = await frameOf({ status: "empty", reason: "no-go" })
    for (const line of lines) {
      expect(Array.from(line).length).toBeLessThanOrEqual(WIDTH)
    }
  })
})
