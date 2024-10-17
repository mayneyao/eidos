import { useEffect } from "react"
import { create } from "zustand"
import { persist } from "zustand/middleware"

import { isDesktopMode, isDevMode, isSelfHosted } from "@/lib/env"
import { uuidv7 } from "@/lib/utils"
import { verifyMessage } from "@/lib/web/crypto"
import { useToast } from "@/components/ui/use-toast"

interface IActivationState {
  code: string
  clientId?: string
  isActivated: boolean
  license?: string

  setClientId: (clientId: string) => void
  setCode: (code: string) => void
  setIsActivated: (isActivated: boolean) => void
  setLicense: (license: string) => void
}

export const useActivationCodeStore = create<IActivationState>()(
  persist(
    (set) => ({
      code: "",
      isActivated: false,
      setClientId: (clientId) => set({ clientId }),
      setCode: (code) => set({ code }),
      setIsActivated: (isActivated) => set({ isActivated }),
      setLicense: (license) => set({ license }),
    }),
    {
      name: "ea-activation",
      getStorage: () => localStorage,
    }
  )
)

export const useActivation = () => {
  const {
    isActivated,
    setIsActivated,
    code,
    setCode,
    clientId,
    license,
    setClientId,
    setLicense,
  } = useActivationCodeStore()
  const { toast } = useToast()
  useEffect(() => {
    if (!clientId) {
      const id = uuidv7()
      setClientId(id)
    }
  }, [clientId, setClientId])

  useEffect(() => {
    const checkLicense = async () => {
      if (!clientId || !license) return
      const signatureArray = JSON.parse(license)
      const signature = new Uint8Array(signatureArray)
      const isValid = await verifyMessage(
        {
          code,
          clientId,
        },
        signature
      )
      setIsActivated(isValid)
    }
    checkLicense()
  }, [clientId, code, license, setIsActivated])

  const active = async (_key: string) => {
    const key = _key.trim()
    const res = await fetch(
      `https://active.eidos.space/active?code=${key}&client=${clientId}`,
      {
        method: "POST",
      }
    )
    if (res.ok) {
      const data = await res.json()
      const { signature } = data
      setLicense(JSON.stringify(signature))
      setIsActivated(true)
      setCode(key)
      return true
    } else {
      const text = await res.text()
      toast({
        title: "Activation failed",
        description: text,
      })
      throw new Error(text)
    }
  }
  return {
    isActivated:
      isDevMode || isSelfHosted
        ? true
        : clientId && license
          ? isActivated
          : false,
    active,
  }
}
