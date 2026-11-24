import { createEffect, createSignal, on, onCleanup, onMount } from "solid-js"
import type { JSX } from "solid-js"
import {
  Command,
  Panel,
  Plugin,
  Style,
  type Context,
  type MountedSession,
  type PanelTab,
} from "@opencode/plugin/gui"
import css from "./panel.css?inline"
import { messages } from "./i18n"
import { GuiUsagePanel } from "./panel"
import type { UsageInfo, UsageState } from "../lib/types"
import { computeRefreshDelay, fetchUsage } from "../lib/usage"

/** Countdown refresh: only text, never a request. */
const NOW_TICK = 30_000

function snapshotOf(state: UsageState): UsageInfo | undefined {
  if (state.status === "ready") return state.info
  if (state.status === "error") return state.previous
  return undefined
}

interface UsagePanelHostProps {
  readonly ctx: Context
  /** Reactive getter: the panel stays mounted across session switches. */
  readonly session: MountedSession
}

/**
 * Owns the polling state machine for one mounted panel and renders the
 * presentational panel. `props.session` is read lazily so a session switch
 * (or a move to another directory) refetches instead of remounting.
 */
function UsagePanelHost(props: UsagePanelHostProps): JSX.Element {
  const directory = () => props.session.directory

  const [state, setState] = createSignal<UsageState>({ status: "loading" })
  const [now, setNow] = createSignal(Date.now())

  let disposed = false
  let refreshing = false
  let rerun = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const schedule = (info: UsageInfo | undefined) => {
    if (disposed) return
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void refresh()
    }, computeRefreshDelay(info, Date.now()))
  }

  const refresh = async (): Promise<void> => {
    if (disposed) return
    if (refreshing) {
      // A directory change or manual refresh during a request: run once more.
      rerun = true
      return
    }
    refreshing = true
    let next: UsageState
    try {
      // Read the client where it is used: the server restart replaces it.
      next = await fetchUsage(props.ctx.client, directory(), snapshotOf(state()))
    } finally {
      refreshing = false
    }
    if (disposed) return
    setState(next)
    setNow(Date.now())
    schedule(snapshotOf(next))
    if (rerun) {
      rerun = false
      void refresh()
    }
  }

  onMount(() => {
    void refresh()
  })

  // A different session directory means a different workspace's allowance.
  createEffect(on(directory, () => void refresh(), { defer: true }))

  const ticker = setInterval(() => setNow(Date.now()), NOW_TICK)

  onCleanup(() => {
    disposed = true
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
    clearInterval(ticker)
  })

  return <GuiUsagePanel state={state()} now={now()} onRefresh={() => void refresh()} />
}

export default Plugin.define({
  i18n: messages,
  setup(ctx) {
    ctx.add(Style, css)

    // One stable tab object: the host renders its title again only for a new one.
    const usageTab: PanelTab = {
      id: "usage",
      get title() {
        return ctx.t("tab.title")
      },
      pinned: true,
      fallback: true,
    }

    ctx.add(Panel, {
      id: "usage",
      region: "side",
      width: "narrow",
      list: () => [usageTab],
      render: (props) => <UsagePanelHost ctx={ctx} session={props.session} />,
    })

    ctx.add(Command, () => ({
      id: "open",
      title: ctx.t("command.open"),
      bind: "mod+shift+g",
      slash: { name: "go-usage" },
      run: () => {
        const session = ctx.sessions.current()
        if (session) ctx.layout.open(`${ctx.id}:usage`, session)
      },
    }))
  },
})
