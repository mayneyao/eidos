declare global {
  interface Window {
    webkit: {
      messageHandlers: {
        eidos: { postMessage(message: unknown): Promise<unknown> }
      }
    }
    eidosLeave: (mode: string) => void
  }
}
const pending = new Set<Promise<unknown>>()
export function request<T>(method: string, params: unknown = {}): Promise<T> {
  const result = window.webkit.messageHandlers.eidos.postMessage({
    method,
    params,
  }) as Promise<T>
  pending.add(result)
  void result.then(
    () => pending.delete(result),
    () => pending.delete(result)
  )
  return result
}
export async function drainRequests(): Promise<void> {
  do {
    await new Promise((resolve) => setTimeout(resolve, 0))
  } while (pending.size)
}
