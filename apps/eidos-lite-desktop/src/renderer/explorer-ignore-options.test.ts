import { expect, it } from "vitest"
import {
  readExplorerIgnoreOptions,
  EXPLORER_IGNORE_OPTIONS_STORAGE_KEY,
} from "./explorer-ignore-options"
it("defaults to respecting ignore rules and restores an explicit saved choice", () => {
  for (const raw of [null, "bad", "{}", '{"respectGitignore":"false"}'])
    expect(readExplorerIgnoreOptions({ getItem: () => raw })).toEqual({
      respectGitignore: true,
    })
  expect(
    readExplorerIgnoreOptions({
      getItem(key) {
        expect(key).toBe(EXPLORER_IGNORE_OPTIONS_STORAGE_KEY)
        return '{"respectGitignore":false}'
      },
    })
  ).toEqual({ respectGitignore: false })
  expect(
    readExplorerIgnoreOptions({
      getItem() {
        throw Error("unavailable")
      },
    })
  ).toEqual({ respectGitignore: true })
})
