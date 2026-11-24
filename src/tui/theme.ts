/**
 * Theme surface for the TUI usage panel.
 *
 * OpenCode hands plugins its fully resolved TUI theme (`context.theme`); every
 * color in it is already an `RGBA` instance. The panel only reads a small slice,
 * so this file declares that slice structurally: the host theme is assignable to
 * `TuiThemeTokens` without an adapter and without importing `@opencode/theme`
 * (a runtime dependency the plugin must not take).
 *
 * Only `text.base` is required. Everything else may be absent (an older host or
 * a hand-built test theme); `resolveTuiPalette` then falls back to the base text
 * color, which stays legible on both dark and light backgrounds.
 */
import type { RGBA } from "@opentui/core"

/** A color value OpenTUI accepts for `fg`/`bg`. */
export type TuiColor = RGBA

/** The slice of OpenCode's resolved theme the panel paints with. */
export interface TuiThemeTokens {
  readonly text: {
    readonly base: RGBA
    readonly muted?: RGBA
    readonly feedback?: {
      readonly success?: { readonly base?: RGBA }
      readonly warning?: { readonly base?: RGBA }
      readonly error?: { readonly base?: RGBA }
    }
  }
  readonly hue?: {
    readonly accent?: Readonly<Record<number, RGBA>>
  }
}

/** Every color the panel paints, with fallbacks already applied. */
export interface TuiPanelPalette {
  readonly text: RGBA
  readonly muted: RGBA
  readonly accent: RGBA
  readonly success: RGBA
  readonly warning: RGBA
  readonly error: RGBA
}

/** Maps the host theme onto the panel palette; missing tokens reuse `text.base`. */
export function resolveTuiPalette(theme: TuiThemeTokens): TuiPanelPalette {
  const base = theme.text.base
  return {
    text: base,
    muted: theme.text.muted ?? base,
    accent: theme.hue?.accent?.[500] ?? base,
    success: theme.text.feedback?.success?.base ?? base,
    warning: theme.text.feedback?.warning?.base ?? base,
    error: theme.text.feedback?.error?.base ?? base,
  }
}
