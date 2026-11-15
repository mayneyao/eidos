import { readFileSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, expect, it } from "vitest"
import english from "../locales/en.json"
import { mobileText, setMobileLocale } from "./locale"

afterEach(() => setMobileLocale("en"))

it("includes English translations for every native Android Sync message", () => {
  const directory = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../apps/eidos-android/app/src/main/java/space/eidos/android"
  )
  const catalog: Record<string, string> = english
  const missing = new Set<string>()
  for (const name of readdirSync(directory).filter((name) =>
    /Sync.*\.kt$/.test(name)
  )) {
    const source = readFileSync(join(directory, name), "utf8")
    for (const match of source.matchAll(/\btr\(("(?:[^"\\]|\\.)*")/g)) {
      const key: string = JSON.parse(match[1])
      if (!catalog[key]?.trim()) missing.add(`${name}: ${key}`)
    }
  }
  expect([...missing]).toEqual([])
})

it("switches the custom server entry between English and Chinese", () => {
  const title = "自定义服务器"
  const description = "连接自建 Graft 服务器，无需 Eidos 账号"
  setMobileLocale("en")
  expect(mobileText(title)).toBe("Custom server")
  expect(mobileText(description)).toBe(
    "Connect to your own Graft server without an Eidos account"
  )
  setMobileLocale("zh-CN")
  expect(mobileText(title)).toBe(title)
  expect(mobileText(description)).toBe(description)
  setMobileLocale("en")
  expect(mobileText(title)).toBe("Custom server")
})
