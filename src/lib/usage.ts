import type { Meter, UsageInfo, UsageState } from "./types"

/**
 * Structural view of the host client this module needs. The real client
 * (`OpenCodeClient.experimental.usage.limits`) satisfies it; keeping the shape
 * here avoids a runtime dependency on `@opencode/*`.
 */
export interface UsageLimitsClient {
  readonly experimental: {
    readonly usage: {
      limits(input: {
        readonly location: { readonly directory: string }
      }): Promise<{ readonly data: unknown }>
    }
  }
}

/** Delay between polls while usage is healthy. */
export const REFRESH_DELAY = 60_000
/** Delay used while a window is limited or about to reset. */
export const REFRESH_DELAY_URGENT = 5_000

const METERS = ["rolling", "weekly", "monthly"] as const

function metersOf(info: UsageInfo | undefined): Meter[] {
  if (!info?.go) return []
  return METERS.map((key) => info.go![key])
}

/** Short, single-line error text for the panel; never includes a stack. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error.split("\n")[0]!.slice(0, 200) || "Usage request failed"
  if (error instanceof Error) {
    const message = error.message.split("\n")[0]!.trim()
    return message.slice(0, 200) || error.name || "Usage request failed"
  }
  return "Usage request failed"
}

/**
 * Fetches the Go usage snapshot once and maps it onto `UsageState`.
 * A thrown request keeps the previous snapshot so the panel can show stale data.
 */
export async function fetchUsage(
  client: UsageLimitsClient,
  directory: string,
  previous?: UsageInfo,
): Promise<UsageState> {
  try {
    const response = await client.experimental.usage.limits({ location: { directory } })
    const data = (response?.data ?? null) as UsageInfo | null
    if (data === null) {
      return { status: "empty", reason: "signed-out", workspace: previous?.workspace }
    }
    if (!data.go) {
      return { status: "empty", reason: "no-go", workspace: data.workspace }
    }
    return { status: "ready", info: data, updatedAt: Date.now(), stale: false }
  } catch (error) {
    return { status: "error", message: errorMessage(error), previous }
  }
}

/**
 * How long to wait before the next poll: 5s when any window is limited or
 * resets within a second, otherwise 60s.
 */
export function computeRefreshDelay(info: UsageInfo | undefined, now: number): number {
  const meters = metersOf(info)
  for (const meter of meters) {
    if (meter.limited) return REFRESH_DELAY_URGENT
    if (meter.resetsAt <= now + 1_000) return REFRESH_DELAY_URGENT
  }
  return REFRESH_DELAY
}
