import { create } from "zustand"

const useStore = create<{
  input: string
  setInput: (input: string) => void
}>()((set) => ({
  input: "",
  setInput: (input) => set({ input }),
}))

export const useInput = () => {
  const { input, setInput } = useStore()
  const isActionMode = input.startsWith("/")
  const mode = isActionMode ? "action" : "search"
  return {
    input,
    setInput,
    mode,
  }
}
