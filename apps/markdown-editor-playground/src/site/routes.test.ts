import { localizedPath, parseSitePath } from "./routes"

it.each([
  ["/", "en", "/"],
  ["/zh", "zh", "/"],
  ["/zh/", "zh", "/"],
  ["/zh/docs/api/", "zh", "/docs/api"],
  ["/playground", "en", "/playground"],
  ["/zhang", "en", "/zhang"],
])("parses the language and page for %s", (path, locale, route) => {
  expect(parseSitePath(path)).toEqual({ locale, route })
  expect(parseSitePath(localizedPath(route, locale as "en" | "zh"))).toEqual({
    locale,
    route,
  })
})
