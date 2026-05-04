import { createContext, useContext } from "react"

export interface AgentSessionContextType {
  sessionId: string
  isRunning: boolean
  setIsRunning: (running: boolean) => void
  goalInput: string
  setGoalInput: (goal: string) => void
  isAllExpanded?: boolean
  setIsAllExpanded?: (val: boolean) => void
}

export const AgentSessionContext =
  createContext<AgentSessionContextType | null>(null)

export function useAgentSession(): AgentSessionContextType {
  const ctx = useContext(AgentSessionContext)
  if (!ctx) {
    return {
      sessionId: "",
      isRunning: false,
      setIsRunning: () => {},
      goalInput: "",
      setGoalInput: () => {},
    }
  }
  return ctx
}
