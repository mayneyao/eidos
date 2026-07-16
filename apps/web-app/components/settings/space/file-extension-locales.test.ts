import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import en from "@/packages/locales/en.json"
import zh from "@/packages/locales/zh.json"

const TRANSLATION_KEY_PATTERN = /space\.settings\.fileExtensions\.[A-Za-z0-9]+/g

describe("file extension settings translations", () => {
  it("defines every rendered key in English and Chinese", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "apps/web-app/components/settings/space/file-extension-settings.tsx"
      ),
      "utf8"
    )
    const keys = [
      ...new Set(source.match(TRANSLATION_KEY_PATTERN) ?? []),
    ].sort()
    const dictionaries = { en, zh } as const
    const missing = Object.entries(dictionaries).flatMap(
      ([locale, dictionary]) =>
        keys
          .filter(
            (key) => !Object.prototype.hasOwnProperty.call(dictionary, key)
          )
          .map((key) => `${locale}: ${key}`)
    )

    expect(missing).toEqual([])
  })
})
