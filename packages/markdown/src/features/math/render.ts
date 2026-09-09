import katex from "katex"

/** Same safe MathML output for the interactive editor and static documents. */
export function renderMath(value: string, display: boolean): string {
  return katex.renderToString(value, {
    displayMode: display,
    output: "mathml",
    strict: "ignore",
    throwOnError: false,
    trust: false,
  })
}
