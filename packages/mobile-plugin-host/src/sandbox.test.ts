// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { viewHtml } from "../../plugin-runtime/src/sandbox"

vi.mock(
  "../../plugin-runtime/src/browser-module",
  () => import("./browser-module")
)

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

it("isolates dependency variables from the mobile mount arguments", async () => {
  document.body.innerHTML = '<div id="app"></div>'
  vi.spyOn(window, "postMessage").mockImplementation(() => {})
  const html = viewHtml(
    `
    var root = { dependency: true };
    var ctx = { dependency: true };
    export default function mount(context, element) {
      element.innerHTML = '<span></span>';
      element.querySelector('span').textContent = context.i18n.t('title');
      if (!root.dependency || !ctx.dependency) throw Error('Lost package scope');
    }
  `,
    {
      kind: "page",
      route: "",
      locale: "zh-CN",
      languageData: {
        defaultLocale: "en",
        messages: { en: { title: "Example" }, "zh-CN": { title: "示例" } },
      },
    }
  )
  window.eval(
    html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
  )
  await vi.waitFor(() =>
    expect(document.querySelector("#app span")?.textContent).toBe("示例")
  )
})
