declare global {
  interface Window {
    EidosAndroid: { postMessage(message: string): void }
    eidosReply: (
      id: string,
      response: { ok: boolean; value?: unknown; error?: string }
    ) => void
    eidosLeave: (mode: string) => void
    eidosOpen: (session: string) => void
    eidosSuspend: () => void
    eidosFlush?: () => Promise<void>
  }
}
const pending = new Map<
  string,
  { resolve(value: unknown): void; reject(reason: Error): void }
>()
let sequence = 0
let activeSession = ""
export function resetSession(session: string) {
  activeSession = session
  for (const callback of pending.values())
    callback.reject(new Error("文件会话已结束"))
  pending.clear()
}
window.eidosReply = (id, response) => {
  const callback = pending.get(id)
  if (!callback) return
  pending.delete(id)
  if (response.ok) callback.resolve(response.value)
  else callback.reject(new Error(response.error ?? "操作失败"))
}
export type BridgeRequest = <T>(method: string, params?: unknown) => Promise<T>
export function createRequest(session: string): BridgeRequest {
  return <T>(method: string, params: unknown = {}): Promise<T> => {
    if (session !== activeSession)
      return Promise.reject(new Error("文件会话已结束"))
    return new Promise((resolve, reject) => {
      const id = String(++sequence)
      pending.set(id, { resolve: (value) => resolve(value as T), reject })
      try {
        window.EidosAndroid.postMessage(
          JSON.stringify({ id, session, method, params })
        )
      } catch (error) {
        pending.delete(id)
        reject(error)
      }
    })
  }
}

export async function drainRequests(): Promise<void> {
  // Blur commits shared field editors synchronously; yield through their promise chains.
  do {
    await new Promise((resolve) => setTimeout(resolve, 0))
  } while (pending.size > 0)
}
