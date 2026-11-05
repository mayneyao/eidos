import {
  bootstrap,
  type BrowserBinding,
} from "../../../packages/plugin-runtime/src/browser-bootstrap"
import { createWorkerFetch } from "../../../packages/plugin-runtime/src/worker-fetch"
import {
  createPluginI18n,
  pluginLocaleCandidates,
} from "../../../packages/plugin-runtime/src/guest-i18n.js"

type SerializedArguments<T extends unknown[]> = { [K in keyof T]: string }
const json = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")

export function fileViewScript(code: string, binding: BrowserBinding): string {
  // Keep the serialized call checked against the canonical bootstrap contract.
  const args: SerializedArguments<Parameters<typeof bootstrap>> = [
    "m.default",
    json(binding),
    createWorkerFetch.toString(),
    createPluginI18n.toString(),
    pluginLocaleCandidates.toString(),
  ]
  return (
    "const code=" +
    json(code) +
    ";const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));import(url).then(m=>(" +
    bootstrap.toString() +
    ")(" +
    args.join(",") +
    ")).catch(e=>{document.getElementById('app').textContent=e.message}).finally(()=>URL.revokeObjectURL(url));"
  )
}
