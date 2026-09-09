import fs from "node:fs/promises"

await fs.mkdir(new URL("../dist/", import.meta.url), { recursive: true })
// Ship standalone stylesheets: consumers need no CSS import resolution, and
// Workers can inline static.css as a Text module without additional requests.
for (const name of ["styles.css", "static.css"]) {
  let css = await fs.readFile(
    new URL(`../src/${name}`, import.meta.url),
    "utf8"
  )
  for (const shared of ["content-theme.css", "content.css"]) {
    css = css.replace(
      `@import "./${shared}";`,
      await fs.readFile(new URL(`../src/${shared}`, import.meta.url), "utf8")
    )
  }
  await fs.writeFile(new URL(`../dist/${name}`, import.meta.url), css)
}
