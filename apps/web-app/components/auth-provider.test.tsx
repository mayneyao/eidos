import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { AuthProvider, useAuth } from "./auth-provider"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("@/lib/env", () => ({
  isDesktopMode: true,
}))

function AuthProbe() {
  const { isAuthenticated, isLoading } = useAuth()
  return (
    <output
      data-authenticated={String(isAuthenticated)}
      data-loading={String(isLoading)}
    />
  )
}

describe("AuthProvider desktop bootstrap", () => {
  let container: HTMLDivElement
  let root: Root
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    container = document.createElement("div")
    root = createRoot(container)
    fetchMock = vi.fn(async () =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          authenticated: false,
          user: null,
          hasValidTokens: false,
        }),
      } as Response)
    )
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    act(() => root.unmount())
    vi.unstubAllGlobals()
  })

  it("does not request an access token for an anonymous session", async () => {
    await act(async () => {
      root.render(
        <AuthProvider>
          <AuthProbe />
        </AuthProvider>
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:13127/api/auth/user"
    )
    expect(container.querySelector("output")?.dataset).toMatchObject({
      authenticated: "false",
      loading: "false",
    })
  })
})
