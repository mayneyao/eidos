import { Fragment } from "react"
import { literalTextMatches } from "../shared/text-search"

export function SearchHighlight({
  text,
  query,
  ranges,
}: {
  text: string
  query: string
  ranges?: { start: number; end: number }[]
}) {
  const matches = ranges ?? literalTextMatches(text, query)
  let offset = 0
  return (
    <>
      {matches.map((match) => {
        const prefix = text.slice(offset, match.start)
        offset = match.end
        return (
          <Fragment key={match.start}>
            {prefix}
            <mark>{text.slice(match.start, match.end)}</mark>
          </Fragment>
        )
      })}
      {text.slice(offset)}
    </>
  )
}
