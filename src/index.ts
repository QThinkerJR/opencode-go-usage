import { Plugin } from "@opencode/plugin"

/**
 * The server part is intentionally inert. OpenCode only loads a package's TUI
 * part when the package has a server entry, so this part registers the package;
 * all usage data comes from the host's own API in the TUI and GUI parts.
 */
export default Plugin.define({
  id: "opencode-go-usage",
  setup() {},
})
