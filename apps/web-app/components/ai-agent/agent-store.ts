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

export interface AgentSession {
  id: string
  goal: string
  status: "planning" | "executing" | "completed" | "error" | "stopped"
  planSteps: AgentStep[]
  model: string
  space: string
  createdAt: string
  completedAt?: string
  maxSteps: number
}

interface AgentStore {
  // Session management
  sessions: AgentSession[]
  currentSessionId: string | null
  addSession: (session: AgentSession) => void
  removeSession: (id: string) => void
  setCurrentSession: (id: string | null) => void

  // UI state
  isRunning: boolean
  setIsRunning: (running: boolean) => void
  goalInput: string
  setGoalInput: (goal: string) => void

  // Plan management
  setPlanSteps: (sessionId: string, steps: AgentStep[]) => void
  updateStepStatus: (
    sessionId: string,
    stepId: string,
    status: AgentStep["status"],
    result?: unknown,
    error?: string
  ) => void

  // Config (per-space)
  maxSteps: Record<string, number>
  getMaxSteps: (space: string) => number
  setMaxSteps: (space: string, steps: number) => void
}

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,
      addSession: (session) =>
        set((state) => ({ sessions: [session, ...state.sessions] })),
      removeSession: (id) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
          currentSessionId:
            state.currentSessionId === id ? null : state.currentSessionId,
        })),
      setCurrentSession: (id) => set({ currentSessionId: id }),

      isRunning: false,
      setIsRunning: (running) => set({ isRunning: running }),
      goalInput: "",
      setGoalInput: (goal) => set({ goalInput: goal }),

      setPlanSteps: (sessionId, steps) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, planSteps: steps } : s
          ),
        })),
      updateStepStatus: (sessionId, stepId, status, result, error) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  planSteps: s.planSteps.map((step) =>
                    step.id === stepId
                      ? {
                          ...step,
                          status,
                          toolResult: result ?? step.toolResult,
                          error: error ?? step.error,
                        }
                      : step
                  ),
                }
              : s
          ),
        })),

      maxSteps: {},
      getMaxSteps: (space) => get().maxSteps[space] || 10,
      setMaxSteps: (space, steps) =>
        set((state) => ({
          maxSteps: { ...state.maxSteps, [space]: steps },
        })),
    }),
    {
      name: "ai-agent-store",
      getStorage: () => localStorage,
      partialize: (state) => ({
        sessions: state.sessions,
        maxSteps: state.maxSteps,
      }),
    }
  )
)
