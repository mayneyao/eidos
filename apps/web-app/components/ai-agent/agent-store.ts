import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface AgentStep {
  id: string
  description: string
  status: "pending" | "in_progress" | "completed" | "failed"
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: unknown
  error?: string
}

export interface StoredMessage {
  id: string
  role: string
  text: string
}

export interface AgentSession {
  id: string
  goal: string
  status: "planning" | "executing" | "completed" | "error" | "stopped"
  planSteps: AgentStep[]
  messages: StoredMessage[]
  model: string
  space: string
  createdAt: string
  completedAt?: string
  maxSteps: number
}

interface AgentStore {
  sessions: AgentSession[]
  currentSessionId: string | null

  // Session list management (loaded from API)
  setSessions: (sessions: AgentSession[]) => void
  setCurrentSession: (id: string | null) => void

  // Active session (created in current page lifecycle)
  addActiveSession: (session: AgentSession) => void
  updateSessionMessages: (
    id: string,
    messages: StoredMessage[],
    status: AgentSession["status"]
  ) => void

  // UI state (not persisted)
  isRunning: boolean
  setIsRunning: (running: boolean) => void
  goalInput: string
  setGoalInput: (goal: string) => void

  planSteps: AgentStep[]
  setPlanSteps: (steps: AgentStep[]) => void
  updateStepStatus: (
    stepId: string,
    status: AgentStep["status"],
    result?: unknown,
    error?: string
  ) => void

  maxSteps: number
  setMaxSteps: (steps: number) => void
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,

      setSessions: (sessions) => set({ sessions }),
      setCurrentSession: (id) => set({ currentSessionId: id }),

      addActiveSession: (session) =>
        set((state) => ({ sessions: [session, ...state.sessions] })),
      updateSessionMessages: (id, messages, status) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id
              ? {
                  ...s,
                  messages,
                  status,
                  completedAt: new Date().toISOString(),
                }
              : s
          ),
        })),

      isRunning: false,
      setIsRunning: (running) => set({ isRunning: running }),
      goalInput: "",
      setGoalInput: (goal) => set({ goalInput: goal }),

      planSteps: [],
      setPlanSteps: (steps) => set({ planSteps: steps }),
      updateStepStatus: (stepId, status, result, error) =>
        set((state) => ({
          planSteps: state.planSteps.map((step) =>
            step.id === stepId
              ? {
                  ...step,
                  status,
                  toolResult: result ?? step.toolResult,
                  error: error ?? step.error,
                }
              : step
          ),
        })),

      maxSteps: 10,
      setMaxSteps: (steps) => set({ maxSteps: steps }),
    }),
    {
      name: "ai-agent-ui-state",
      getStorage: () => localStorage,
      partialize: (state) => ({
        maxSteps: state.maxSteps,
      }),
    }
  )
)

// API helpers
export async function fetchSessions(space: string): Promise<AgentSession[]> {
  const res = await fetch(`/api/agent?space=${encodeURIComponent(space)}`)
  if (!res.ok) return []
  return res.json()
}

export async function fetchSession(
  space: string,
  id: string
): Promise<AgentSession | null> {
  const res = await fetch(
    `/api/agent?space=${encodeURIComponent(space)}&id=${encodeURIComponent(id)}`
  )
  if (!res.ok) return null
  return res.json()
}
