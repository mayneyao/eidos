import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface SessionMeta {
  id: string
  goal: string
  status: string
  model: string
  space: string
  createdAt: string
  completedAt?: string
  maxSteps: number
}

interface AgentStore {
  sessions: SessionMeta[]
  setSessions: (sessions: SessionMeta[]) => void

  // Backward-compatibility stubs
  isRunning: boolean
  setIsRunning: (running: boolean) => void
  goalInput: string
  setGoalInput: (goal: string) => void
  currentSessionId: string | null
  setCurrentSession: (id: string | null) => void

  maxSteps: number
  setMaxSteps: (steps: number) => void
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set) => ({
      sessions: [],
      setSessions: (sessions) => set({ sessions }),

      isRunning: false,
      setIsRunning: () => {},
      goalInput: "",
      setGoalInput: () => {},
      currentSessionId: null,
      setCurrentSession: () => {},

      maxSteps: 10,
      setMaxSteps: (steps) => set({ maxSteps: steps }),
    }),
    {
      name: "ai-agent-store",
      getStorage: () => localStorage,
      partialize: (state) => ({ maxSteps: state.maxSteps }),
    }
  )
)

// API helpers — fetch raw session data (messages stored in UIMessage format in JSON)
export async function fetchSessions(): Promise<SessionMeta[]> {
  const res = await fetch(`/api/agent/sessions`)
  if (!res.ok) return []
  return res.json()
}

export async function fetchSession(
  id: string
): Promise<{ messages: unknown[] } | null> {
  const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`)
  if (!res.ok) return null
  return res.json()
}

export async function deleteSession(id: string): Promise<boolean> {
  const res = await fetch(`/api/agent/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  return res.ok
}
