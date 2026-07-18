"use client"

import { useState } from "react"

export function CodeBlock({
  code,
  language = "tsx",
  label,
}: {
  code: string
  language?: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <figure className="code-figure">
      <figcaption>
        <span>{label ?? language}</span>
        <button type="button" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy code"}
        </button>
      </figcaption>
      <pre>
        <code data-language={language}>{code}</code>
      </pre>
    </figure>
  )
}
