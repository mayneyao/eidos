const headerPattern =
  /^ {0,3}>[ \t]*\[!([A-Za-z][\w-]*)\]([+-])?(?:[ \t]+(.*))?(?:\n|$)/u

export function parseCallout(source: string) {
  const header = source.match(headerPattern)
  if (!header) return null
  const defaultTitle =
    header[1].charAt(0).toUpperCase() + header[1].slice(1).toLowerCase()
  return {
    calloutType: header[1].toLowerCase(),
    calloutTitle: header[3]?.trim() || defaultTitle,
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
