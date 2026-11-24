/** One usage window of the OpenCode Go allowance. */
export type Meter = {
  /** Share of the window's allowance already used, 0-100. */
  percent: number
  /** Go refuses requests until the window resets. */
  limited: boolean
  /** Milliseconds since the Unix epoch. */
  resetsAt: number
}

export type GoUsage = {
  rolling: Meter
  weekly: Meter
  monthly: Meter
}

export type Workspace = {
  id: string
  name?: string
  usageURL: string
}

export type UsageInfo = {
  workspace: Workspace
  go?: GoUsage
  budgets: unknown[]
}

/** The single data contract shared by the TUI and GUI panels. */
export type UsageState =
  | { status: "loading" }
  | { status: "ready"; info: UsageInfo; updatedAt: number; stale: boolean }
  | { status: "empty"; reason: "signed-out" | "no-go"; workspace?: Workspace }
  | { status: "error"; message: string; previous?: UsageInfo }
