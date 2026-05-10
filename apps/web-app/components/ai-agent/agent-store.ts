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
      setIsRunning: (isRunning) => set({ isRunning }),
      goalInput: "",
      setGoalInput: (goalInput) => set({ goalInput }),
      currentSessionId: null,
      setCurrentSession: (id) => set({ currentSessionId: id }),

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

export interface SessionSearchResult {
  sessionId: string
  goal: string
  status: string
  createdAt: string
  completedAt?: string
  snippets: Array<{ lineNumber: number; content: string }>
}

// API helpers — fetch raw session data (messages stored in UIMessage format in JSON)
export async function fetchSessions(): Promise<SessionMeta[]> {
  const res = await fetch(`/api/agent/sessions`)
  if (!res.ok) return []
  return res.json()
}

export async function searchSessions(
  query: string
): Promise<SessionSearchResult[]> {
  const res = await fetch(
    `/api/agent/sessions/search?q=${encodeURIComponent(query)}`
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.results ?? []
}

export interface SkillSearchResult {
  name: string
  dirName: string
  snippets: Array<{ content: string; line: number }>
}

export async function searchSkills(
  query: string
): Promise<SkillSearchResult[]> {
  const res = await fetch(
    `/api/agent/skills/search?q=${encodeURIComponent(query)}`
  )
  if (!res.ok) return []
  const data = await res.json()
  return data.results ?? []
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
