import { useCallback, useEffect, useRef, useState } from "react"
import { create } from "zustand"

import { isDesktopMode } from "@/lib/env"
import { useToast } from "@/components/ui/use-toast"

export interface LicenseInfo {
  licenseKey: string
  plan: string
  expiresAt: string
}

interface IActivationState {
  isActivated: boolean
  license: LicenseInfo | null
  isLoading: boolean

  setIsActivated: (isActivated: boolean) => void
  setLicense: (license: LicenseInfo | null) => void
  setIsLoading: (isLoading: boolean) => void
}

export const useActivationStore = create<IActivationState>()((set) => ({
  isActivated: true, // Default to true - only specific features require license
  license: null,
  isLoading: false, // Not loading by default

  setIsActivated: (isActivated) => set({ isActivated }),
  setLicense: (license) => set({ license }),
  setIsLoading: (isLoading) => set({ isLoading }),
}))

/**
 * Check if license is valid (not expired)
 */
function isLicenseValid(license: LicenseInfo | null): boolean {
  if (!license) return false
  if (!license.expiresAt) return true
  return new Date(license.expiresAt) > new Date()
}

// Global flag to track if license has been initialized
let licenseInitialized = false

// Track the actual license state separately from default
type LicenseStatus = "unknown" | "valid" | "invalid" | "not-required"
let licenseStatus: LicenseStatus = "unknown"

/**
 * Hook for managing license activation
 * Integrates with desktop license mechanism
 */
export const useActivation = () => {
  const {
    isActivated,
    license,
    isLoading,
    setIsActivated,
    setLicense,
    setIsLoading,
  } = useActivationStore()
  const { toast } = useToast()
  const initializingRef = useRef(false)

  // Fetch license info on mount (desktop only) - only runs once globally
  // Note: This updates the license info but does NOT change isActivated default
  // Only specific features should check license status
  useEffect(() => {
    // Skip if already initialized globally or currently initializing
    if (licenseInitialized || initializingRef.current) return

    initializingRef.current = true

    const fetchLicenseInfo = async () => {
      // Web mode or no license API available - keep default (activated)
      if (
        !isDesktopMode ||
        typeof window === "undefined" ||
        !window.eidos?.license
      ) {
        licenseInitialized = true
        licenseStatus = "not-required"
        initializingRef.current = false
        return
      }

      setIsLoading(true)
      try {
        const info = await window.eidos.license.getLicenseInfo()
        if (info && isLicenseValid(info)) {
          setLicense(info)
          licenseStatus = "valid"
        } else {
          setLicense(null)
          licenseStatus = "invalid"
        }
      } catch (error) {
        console.error("Failed to fetch license info:", error)
        setLicense(null)
        licenseStatus = "invalid"
      } finally {
        setIsLoading(false)
        licenseInitialized = true
        initializingRef.current = false
      }
    }

    fetchLicenseInfo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty dependency array - only run once

  /**
   * Activate license with key
   */
  const activate = useCallback(
    async (licenseKey: string, token?: string): Promise<boolean> => {
      if (
        !isDesktopMode ||
        typeof window === "undefined" ||
        !window.eidos?.license
      ) {
        toast({
          title: "Activation not available",
          description:
            "License activation is only available in the desktop application.",
          variant: "destructive",
        })
        return false
      }

      try {
        const result = await window.eidos.license.activateLicense(
          licenseKey,
          token
        )
        if (result.success) {
          setLicense(result.payload ?? null)
          setIsActivated(true)
          toast({
            title: "License activated",
            description: "Your license has been successfully activated.",
          })
          return true
        } else {
          toast({
            title: "Activation failed",
            description: result.error || "Failed to activate license.",
            variant: "destructive",
          })
          return false
        }
      } catch (error) {
        console.error("License activation error:", error)
        toast({
          title: "Activation failed",
          description:
            error instanceof Error ? error.message : "Unknown error occurred.",
          variant: "destructive",
        })
        return false
      }
    },
    [setIsActivated, setLicense, toast]
  )

  /**
   * Refresh license info from desktop
   */
  const refresh = useCallback(async (): Promise<void> => {
    if (
      !isDesktopMode ||
      typeof window === "undefined" ||
      !window.eidos?.license
    ) {
      return
    }

    setIsLoading(true)
    try {
      const info = await window.eidos.license.getLicenseInfo()
      if (info && isLicenseValid(info)) {
        setLicense(info)
        setIsActivated(true)
      } else {
        setLicense(null)
        setIsActivated(false)
      }
    } catch (error) {
      console.error("Failed to refresh license info:", error)
    } finally {
      setIsLoading(false)
    }
  }, [setIsActivated, setIsLoading, setLicense])

  /**
   * Check if user has a valid license (for specific features)
   */
  const hasValidLicense = useCallback((): boolean => {
    return license !== null && isLicenseValid(license)
  }, [license])

  return {
    isActivated, // Always true by default (for global access)
    license, // Actual license info (null if no valid license)
    isLoading, // Loading state for license check
    hasValidLicense, // Function to check if specific features requiring license are available
    activate,
    refresh,
  }
}

/**
 * Hook for checking if a feature requiring license is available
 * Shows toast notification if not activated
 */
export const useLicensedFeature = () => {
  const license = useActivationStore((state) => state.license)
  const isLoading = useActivationStore((state) => state.isLoading)
  const { toast } = useToast()

  /**
   * Check if feature is available, show toast if not
   */
  const checkFeatureAvailable = useCallback(
    (featureName: string): boolean => {
      if (isLoading) return false
      const hasLicense = license !== null && isLicenseValid(license)
      if (!hasLicense) {
        toast({
          title: "License required",
          description: `${featureName} requires an active license. Please activate your license in settings.`,
          variant: "destructive",
        })
        return false
      }
      return true
    },
    [isLoading, toast]
  )

  return {
    isLoading,
    checkFeatureAvailable,
  }
}
