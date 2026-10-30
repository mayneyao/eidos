// @vitest-environment jsdom
const entry = vi.hoisted(() => ({
  workspace: vi.fn(),
  properties: vi.fn(),
  render: vi.fn(),
}))
vi.mock("react-dom/client", () => ({
  default: { createRoot: () => ({ render: entry.render }) },
}))
vi.mock("./app", () => {
  entry.workspace()
  return { App: () => null }
})
vi.mock("./file-properties-window", () => {
  entry.properties()
  return { FilePropertiesApp: () => null }
})
vi.mock("./i18n", () => ({ EidosLiteI18nProvider: () => null }))
vi.mock("./plugin-bluetooth-picker", () => ({
  PluginBluetoothPicker: () => null,
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  document.body.innerHTML = '<div id="root"></div>'
})

it("opens the inspector without evaluating the workspace entry", async () => {
  window.location.hash = "/file-properties"
  await import("./file-properties-main")
  await vi.waitFor(() => expect(entry.render).toHaveBeenCalledOnce())
  expect(entry.properties).toHaveBeenCalledOnce()
  expect(entry.workspace).not.toHaveBeenCalled()
})

it("keeps the normal workspace entry for Space windows", async () => {
  window.location.hash = ""
  await import("./main")
  await vi.waitFor(() => expect(entry.render).toHaveBeenCalledOnce())
  expect(entry.workspace).toHaveBeenCalledOnce()
  expect(entry.properties).not.toHaveBeenCalled()
})
