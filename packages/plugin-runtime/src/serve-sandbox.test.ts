// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, expect, it } from "vitest"

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  delete document.body.dataset.events
})

it("exposes the Serve contract and disposes observers independently", async () => {
  // Exercise the actual JavaScript embedded by Rust, not a parallel mock SDK.
  const source = readFileSync(
    path.resolve(
      __dirname,
      "../../../crates/eidos-runtime-host/src/plugin_store.rs"
    ),
    "utf8"
  )
  const bootstrap = source.match(
    /const BOOTSTRAP_JS: &str = r#"([\s\S]*?)"#;/
  )![1]
  document.body.innerHTML = '<div id="app"></div>'
  document.body.dataset.events = ""
  window.eval(`${bootstrap}
    bootstrap((ctx) => {
      if (ctx.binding.kind !== 'file' || ctx.binding.location.tableId !== 'table') throw Error('Invalid binding');
      if ('table' in ctx || 'table' in ctx.binding || 'settings' in ctx.capabilities || 'fs' in ctx.capabilities) throw Error('Unexpected alias or placeholder');
      if ('pluginConfig' in ctx.capabilities.eidos.table || 'navigate' in ctx.capabilities.ui) throw Error('Unsupported service exposed');
      for (const method of ['read', 'getPage', 'updateProperties', 'observe']) {
        if (method in ctx.capabilities.eidos.table) throw Error('Obsolete table API exposed');
      }
      for (const method of ['readContext', 'readRows', 'setViewConfig', 'watch']) {
        if (typeof ctx.capabilities.eidos.table[method] !== 'function') throw Error('Missing table API');
      }
      const first = ctx.capabilities.eidos.table.watch(() => { document.body.dataset.events += 'first;'; first.dispose(); });
      ctx.capabilities.eidos.table.watch(() => { document.body.dataset.events += 'second;'; });
    }, { tableId: 'table', viewId: 'view' });`)
  await Promise.resolve()
  const invalidate = () =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          protocol: "eidos-plugin",
          apiVersion: 1,
          observation: "host.table",
          value: null,
        },
      })
    )
  invalidate()
  invalidate()
  expect(document.body.dataset.events).toBe("first;second;second;")
  window.dispatchEvent(new Event("pagehide"))
  invalidate()
  expect(document.body.dataset.events).toBe("first;second;second;")
})
