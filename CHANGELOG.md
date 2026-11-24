# Changelog

All notable changes to this package. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the version numbers follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-24

### Added

- **TUI panel**: a read-only `sidebar.content` panel with one row per OpenCode Go window (5-hour, weekly, monthly),
  used percentage, character progress bar, reset countdown, `LIMITED` and `stale` markers, and theme-aware colors.
- **Desktop panel**: a pinned side-region tab (`Go Usage` / `Go 用量`) with HTML/CSS progress bars, a refresh button,
  loading skeleton, error/empty states, the command palette entry **Open Go usage**, the default shortcut
  `Ctrl+Shift+G`, and the slash command `/go-usage`.
- **Polling**: 60-second refresh while healthy, 5-second refresh when a window is limited or about to reset, and a
  kept snapshot marked `stale` when a request fails.
- **Local data source**: reads `client.experimental.usage.limits()` from the host OpenCode server; the plugin never
  reads `auth.json`, `opencode.db`, or any token, and never calls the upstream service directly.

### Notes

- The server part is intentionally inert. It only registers the package so OpenCode loads the TUI part.
- The Desktop GUI plugin API is experimental.

[0.1.0]: https://github.com/QThinkerJR/opencode-go-usage/releases/tag/v0.1.0
