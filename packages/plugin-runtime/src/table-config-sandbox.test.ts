// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { viewHtml } from "./sandbox"

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  delete document.body.dataset.events
  delete document.body.dataset.ready
  vi.unstubAllGlobals()
})
it("keeps page metadata separate from common connection services", async () => {
  vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
  const html = viewHtml(
    `export default function(ctx) {
    if (Object.keys(ctx.binding).sort().join() !== 'kind,route') throw Error('Internal binding metadata leaked');
    if (ctx.capabilities.eidos || !ctx.capabilities.connections || ctx.binding.route !== '/settings') throw Error('Invalid page capabilities');
    document.body.dataset.ready = 'yes';
  }`,
    { kind: "page", route: "/settings", connections: true, capabilities: [] }
  )
  document.body.innerHTML = '<div id="app"></div>'
  window.eval(
    html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
  )
  await Promise.resolve()
  expect(document.body.dataset.ready).toBe("yes")
})

it("keeps table and config subscriptions independent in the serialized guest", async () => {
  // jsdom replaces typed-array globals while Node's TextEncoder keeps its own realm.
  vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
  const html = viewHtml(
    `export default function(ctx) {
    if (ctx.binding.kind !== 'file' || ctx.binding.location.kind !== 'eidos-table') throw Error('Invalid binding');
    if ('table' in ctx || 'editor' in ctx || 'table' in ctx.binding) throw Error('Legacy capability alias');
    if ('confirm' in ctx.capabilities.ui || 'update' in ctx.capabilities.settings) throw Error('Unsupported API exposed');
    const table = ctx.capabilities.eidos.table;
    table.watch(() => { document.body.dataset.events += 'view;'; });
    const config = ctx.capabilities.eidos.config.watch('table', () => {
      document.body.dataset.events += 'config;';
      config.dispose();
    });
    document.body.dataset.ready = 'yes';
  }`,
    {
      kind: "table",
      tableId: "table",
      viewId: "view",
      capabilities: ["eidos/table", "eidos/config"],
    }
  )
  document.body.innerHTML = '<div id="app"></div>'
  document.body.dataset.events = ""
  const script = html.slice(
    html.indexOf("<script>") + 8,
    html.indexOf("</script>")
  )
  window.eval(script)
  await Promise.resolve()
  expect(document.body.dataset.ready).toBe("yes")
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
  expect(document.body.dataset.events).toBe("view;config;view;")
})

it("exposes only declared Eidos members and confines config to the bound table", async () => {
  vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
  const html = viewHtml(
    `export default function(ctx) {
    const { eidos } = ctx.capabilities;
    if ('table' in ctx.capabilities || eidos.table || eidos.schema) throw Error('Undeclared capability');
    for (const method of ['read', 'write', 'watch']) {
      try { eidos.config[method]('other', {}); throw Error('Scope escaped'); }
      catch (error) { if (error.code !== 'PERMISSION_DENIED') throw error; }
    }
    document.body.dataset.ready = 'yes';
  }`,
    {
      kind: "table",
      tableId: "table",
      viewId: "view",
      capabilities: ["eidos/config"],
    }
  )
  document.body.innerHTML = '<div id="app"></div>'
  window.eval(
    html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
  )
  await Promise.resolve()
  expect(document.body.dataset.ready).toBe("yes")
})

it("supports file configuration invalidation without granting table queries", async () => {
  vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
  const html = viewHtml(
    `export default function(ctx) {
    const { eidos } = ctx.capabilities;
    if (!eidos.schema || eidos.table) throw Error('Invalid capability set');
    ctx.subscriptions.add(eidos.config.watch('table', () => { document.body.dataset.events += 'config;'; }));
    document.body.dataset.ready = 'yes';
  }`,
    {
      kind: "eidos",
      file: {
        path: "data.eidos",
        name: "data.eidos",
        baseName: "data",
        extension: ".eidos",
        size: 0,
      },
      capabilities: ["eidos/schema", "eidos/config"],
    }
  )
  document.body.innerHTML = '<div id="app"></div>'
  document.body.dataset.events = ""
  window.eval(
    html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
  )
  await Promise.resolve()
  expect(document.body.dataset.ready).toBe("yes")
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
  expect(document.body.dataset.events).toBe("config;")
  window.dispatchEvent(new Event("pagehide"))
  invalidate()
  expect(document.body.dataset.events).toBe("config;")
})
