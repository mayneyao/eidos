const headerPattern =
  /^ {0,3}>[ \t]*\[!([A-Za-z][\w-]*)\]([+-])?(?:[ \t]+(.*))?(?:\n|$)/u

export function parseCallout(source: string) {
  const header = source.match(headerPattern)
  if (!header) return null
  return {
    calloutType: header[1].toLowerCase(),
    calloutTitle: header[3]?.trim() || header[1],
    ...(header[2] === "+" || header[2] === "-"
      ? { calloutFold: header[2] as "+" | "-" }
      : {}),
    body: source
      .split("\n")
      .slice(1)
      .map((line) => line.replace(/^ {0,3}> ?/u, ""))
      .join("\n"),
  }
}
