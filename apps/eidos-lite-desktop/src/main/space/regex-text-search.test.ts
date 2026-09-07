import { regexTextMatches } from "./regex-text-search"
import {
  literalTextMatches,
  normalizeTextSearchOptions,
} from "../../shared/text-search"

it("matches case and Unicode whole words without treating punctuation as patterns", () => {
  expect(
    literalTextMatches("work Work workspace", "work", 500, {
      caseSensitive: true,
      wholeWord: true,
    })
  ).toEqual([{ start: 0, end: 4 }])
  expect(
    literalTextMatches("中文 中文字符", "中文", 500, { wholeWord: true })
  ).toEqual([{ start: 0, end: 2 }])
  expect(literalTextMatches("[a]+", "[a]+")).toHaveLength(1)
  expect(() => normalizeTextSearchOptions({ regex: "yes" })).toThrow()
})
it("executes regex captures and ignores zero-length matches", async () => {
  const signal = new AbortController().signal
  expect(
    await regexTextMatches("work12 Work9", "work\\d+", 500, true, false, signal)
  ).toEqual([{ start: 0, end: 6 }])
  expect(
    await regexTextMatches("abc", "^|$", 500, false, false, signal)
  ).toEqual([])
  await expect(
    regexTextMatches("abc", "[", 500, false, false, signal)
  ).rejects.toThrow()
})
it("terminates catastrophic patterns and cancels an active worker", async () => {
  await expect(
    regexTextMatches(
      "a".repeat(100000) + "!",
      "(a+)+$",
      500,
      false,
      false,
      new AbortController().signal
    )
  ).rejects.toThrow("too long")
  const controller = new AbortController()
  const running = regexTextMatches(
    "a".repeat(100000) + "!",
    "(a+)+$",
    500,
    false,
    false,
    controller.signal
  )
  controller.abort()
  expect(await running).toEqual([])
})
