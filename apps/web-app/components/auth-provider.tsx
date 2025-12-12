import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { isDesktopMode } from "@/lib/env"

export interface AuthUser {
  id: string
  email?: string
  name?: string
  picture?: string
  [key: string]: any
}

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  accessToken: string | null
  login: () => Promise<void>
  logout: () => Promise<void>
  refreshAuth: () => Promise<void>
  getAccessToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const AUTH_API_BASE = "http://127.0.0.1:13127"

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    if (!isDesktopMode) {
      setIsLoading(false)
      return
    }

    try {
      const res = await fetch(`${AUTH_API_BASE}/api/auth/user`)
      if (res.ok) {
        const data = await res.json()
        setUser(data.user)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchAccessToken = useCallback(async (): Promise<string | null> => {
    if (!isDesktopMode) {
      return null
    }

    try {
      const res = await fetch(`${AUTH_API_BASE}/api/auth/token`)
      if (res.ok) {
        const data = await res.json()
        setAccessToken(data.access_token)
        return data.access_token
      }
    } catch {
      // Ignore errors
    }
    setAccessToken(null)
    return null
  }, [])

  const refreshAuth = useCallback(async () => {
    setIsLoading(true)
    await fetchUser()
    await fetchAccessToken()
    setIsLoading(false)
  }, [fetchUser, fetchAccessToken])

  const login = useCallback(async () => {
    if (!isDesktopMode) return

    try {
      // Get authorization URL with PKCE parameters from server
      const res = await fetch(`${AUTH_API_BASE}/api/auth/login`)
      if (!res.ok) {
        console.error("Failed to initiate login")
        return
      }

      const data = await res.json()
      const authUrl = data.url

      if (window.eidos?.openUrl) {
        window.eidos.openUrl(authUrl)
      } else {
        window.open(authUrl, "_blank")
      }
    } catch (e) {
      console.error("Login error:", e)
    }
  }, [])

  const logout = useCallback(async () => {
    if (!isDesktopMode) return

    try {
      await fetch(`${AUTH_API_BASE}/api/auth/logout`, { method: "POST" })
      setUser(null)
      setAccessToken(null)
    } catch (e) {
      console.error("Logout error:", e)
    }
  }, [])

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    // Return cached token if available
    if (accessToken) {
      return accessToken
    }
    // Otherwise fetch fresh token
    return fetchAccessToken()
  }, [accessToken, fetchAccessToken])

  // Initial fetch
  useEffect(() => {
    fetchUser()
    fetchAccessToken()

    // Poll for user status (less frequent since we have IPC)
    const interval = setInterval(fetchUser, 60000) // 60 seconds

    // Listen for auth state changes from main process (OAuth callback / logout)
    let unsubscribe: (() => void) | undefined
    if (window.eidos?.on) {
      const listenerId = window.eidos.on(
        "auth-state-changed",
        (_event: any, data: { authenticated: boolean; user?: AuthUser }) => {
          if (data.authenticated && data.user) {
            setUser(data.user)
            // Fetch new access token after login
            fetchAccessToken()
          } else {
            setUser(null)
            setAccessToken(null)
          }
        }
      )
      if (listenerId) {
        unsubscribe = () => {
          if (window.eidos?.off) {
            window.eidos.off("auth-state-changed", listenerId)
          }
        }
      }
    }

    return () => {
      clearInterval(interval)
      unsubscribe?.()
    }
  }, [fetchUser, fetchAccessToken])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      accessToken,
      login,
      logout,
      refreshAuth,
      getAccessToken,
    }),
    [user, isLoading, accessToken, login, logout, refreshAuth, getAccessToken]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

/**
 * Hook that returns auth state only if available (won't throw if used outside provider)
 */
export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthContext)
}

