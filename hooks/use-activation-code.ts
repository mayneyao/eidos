import { create } from "zustand"
import { persist } from "zustand/middleware"

interface IActivationState {
  code: string
  isActivated: boolean

  setCode: (code: string) => void
  setIsActivated: (isActivated: boolean) => void
}

const useActivationCodeStore = create<IActivationState>()(
  persist(
    (set) => ({
      code: "",
      isActivated: false,
      setCode: (code) => set({ code }),
      setIsActivated: (isActivated) => set({ isActivated }),
    }),
    {
      name: "ea-activation",
      getStorage: () => localStorage,
    }
  )
)

export const useActivationCode = () => {
  const { isActivated, setIsActivated, setCode } = useActivationCodeStore()

  const active = async (key: string) => {
    const res = await fetch(`https://active.eidos.space/active?code=${key}`, {
      method: "POST",
    })

    if (res.ok) {
      setIsActivated(true)
      setCode(key)
      return true
    } else {
      const text = await res.text()
      throw new Error(text)
    }
  }
  return {
    isActivated,
    active,
  }
}
