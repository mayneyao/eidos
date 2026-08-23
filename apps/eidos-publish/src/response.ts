export async function withRequestId(
  response: Response,
  requestId: string
): Promise<Response> {
  // Reconstructing a 101 response drops its WebSocket. Relay upgrades must
  // pass through the shared eidos.ink gateway unchanged.
  if (response.webSocket) return response
  const headers = new Headers(response.headers)
  headers.set("X-Eidos-Request-Id", requestId)
  if (
    response.status >= 400 &&
    response.headers.get("content-type")?.includes("application/json")
  ) {
    const value = await response.json<Record<string, unknown>>()
    const error = value.error
    if (typeof error === "object" && error !== null && !Array.isArray(error)) {
      return Response.json(
        { ...value, error: { ...error, requestId } },
        { status: response.status, statusText: response.statusText, headers }
      )
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
