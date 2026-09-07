import { renderToStaticMarkup } from "react-dom/server"
import { SearchHighlight } from "./search-highlight"

it("highlights literal case-insensitive matches without changing or interpreting source", () => {
  expect(
    renderToStaticMarkup(
      <SearchHighlight text="中文 [a]+ <script> [A]+" query="[a]+" />
    )
  ).toBe("中文 <mark>[a]+</mark> &lt;script&gt; <mark>[A]+</mark>")
  expect(
    renderToStaticMarkup(<SearchHighlight text="中文和中文" query="中文" />)
  ).toBe("<mark>中文</mark>和<mark>中文</mark>")
  expect(
    renderToStaticMarkup(<SearchHighlight text="plain text" query="" />)
  ).toBe("plain text")
})
