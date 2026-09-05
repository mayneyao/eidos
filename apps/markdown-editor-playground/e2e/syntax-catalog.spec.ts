import { expect, test } from "@playwright/test"
import { syntaxExamples } from "../src/site/syntax-catalog"

for (const preset of ["commonmark", "gfm", "eidos", "obsidian"] as const) {
  test(`${preset} renders every enabled syntax example without losing its source`, async ({
    page,
  }) => {
    test.setTimeout(60_000)
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    for (const example of syntaxExamples.filter((entry) =>
      preset === "commonmark"
        ? entry.group === "CommonMark"
        : entry.presets.includes(preset)
    )) {
      await page.goto(`/spec?preset=${preset}#${example.id}`)
      await expect(page.getByLabel("Example Markdown source")).toHaveValue(
        example.source
      )
      const editor = page.getByLabel("Syntax preview editor", { exact: true })
      await expect(editor).toBeVisible()
      await expect(editor).not.toBeEmpty()
      if (example.id === "table")
        await expect(editor.locator("table")).toBeVisible()
      if (example.id === "extended-autolink")
        await expect(
          editor.getByRole("link", { name: "www.example.com", exact: true })
        ).toBeVisible()
      if (example.id === "inline-math")
        await expect(editor.locator(".katex")).toBeVisible()
      if (example.id === "tag-filter")
        await expect(editor.locator("script, iframe")).toHaveCount(0)
      expect(errors, `${preset}/${example.id}`).toEqual([])
    }
  })
}
