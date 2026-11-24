/** @jsxImportSource @opentui/solid */
import { createSignal, onCleanup, onMount } from "solid-js"
import type { JSX } from "@opentui/solid"
import { Plugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/plugin"
import type { UsageInfo, UsageState } from "../lib/types"
import { computeRefreshDelay, fetchUsage } from "../lib/usage"
import { TuiUsagePanel } from "./panel"

type MeasurableBox = { readonly width?: number }

function SidebarHost(props: { readonly context: Context }): JSX.Element {
  const context = props.context
  const location = context.location ?? context.data.location.default()
  const directory: string = location.directory

  const [state, setState] = createSignal<UsageState>({ status: "loading" })
  const [width, setWidth] = createSignal(36)

  let disposed = false
  let refreshing = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let box: MeasurableBox | undefined

  const previousInfo = (): UsageInfo | undefined => {
    const current = state()
    if (current.status === "ready") return current.info
    if (current.status === "error") return current.previous
    return undefined
  }

  const infoOf = (next: UsageState): UsageInfo | undefined => {
    if (next.status === "ready") return next.info
    if (next.status === "error") return next.previous
    return undefined
  }

  const schedule = (info: UsageInfo | undefined) => {
    if (disposed) return
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void refresh()
    }, computeRefreshDelay(info, Date.now()))
  }

  const refresh = async (): Promise<void> => {
    if (disposed || refreshing) return
    refreshing = true
    let next: UsageState
    try {
      next = await fetchUsage(context.client, directory, previousInfo())
    } finally {
      refreshing = false
    }
    if (disposed) return
    setState(next)
    schedule(infoOf(next))
  }

  const applyWidth = (value: number | undefined) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return
    const next = Math.floor(value)
    if (next > 0 && next !== width()) setWidth(next)
  }

  // OpenTUI 0.8 calls onSizeChange without arguments and binds `this` to the
  // renderable, so read the instance width and fall back to the ref.
  const measure = function (this: MeasurableBox | undefined) {
    applyWidth(this?.width)
    if (typeof this?.width !== "number") applyWidth(box?.width)
  }

  context.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: "go-usage.refresh",
        title: "Refresh Go usage",
        slash: { name: "go-usage-refresh" },
        run: () => void refresh(),
      },
    ],
  }))

  onMount(() => {
    void refresh()
  })

  onCleanup(() => {
    disposed = true
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  })

  return (
    <box
      flexDirection="column"
      ref={(element) => {
        box = element as unknown as MeasurableBox
      }}
      onSizeChange={measure}
    >
      <TuiUsagePanel state={state()} theme={context.theme} width={width()} />
    </box>
  )
}

export default Plugin.define({
  id: "opencode-go-usage.tui",
  setup(context) {
    const dispose = context.ui.slot({
      append: "sidebar.content",
      render: () => <SidebarHost context={context} />,
    })
    return () => {
      dispose()
    }
  },
})
