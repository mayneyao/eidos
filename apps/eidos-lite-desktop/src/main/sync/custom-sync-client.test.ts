import { CustomSyncClient, customSyncOrigin } from "./custom-sync-client"

const origin = "https://personal.example"
const encryption = {
  profile: "encrypted-remote-v1",
  version: 1,
  suite: 1,
  uuid: "00010203-0405-4607-8809-0a0b0c0d0e0f",
} as const
const discovery = () => ({
  protocol: "graft-remote",
  version: 1,
  remote_url_template: `${origin}/personal/{repository}`,
  authentication: { scheme: "bearer", authority: origin },
  management: { repositories: `${origin}/api/graft/repositories` },
})
const repository = () => ({
  name: "notes",
  display_name: "My notes",
  created_at: 1,
  remote_url: `${origin}/personal/notes`,
  encryption,
})
const token = "synthetic-token-0123456789abcdef0123456789"

describe("CustomSyncClient", () => {
  it("discovers without a token, then creates and verifies an encrypted personal repository", async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const client = new CustomSyncClient(origin, async (input, init) => {
      const url = String(input)
      calls.push({ url, init })
      if (url.endsWith("/.well-known/graft")) return Response.json(discovery())
      if (init?.method === "PUT")
        return Response.json({
          ...repository(),
          created: true,
          namespace: "personal",
          repository: "notes",
        })
      return Response.json({
        protocol: "graft-remote",
        version: 1,
        repository: "internal-id",
        encryption,
      })
    })
    await expect(
      client.provisionRepository("notes", "My notes", token)
    ).resolves.toMatchObject({
      encryption,
      remoteUrl: `${origin}/personal/notes`,
    })
    expect(new Headers(calls[0]?.init?.headers).has("Authorization")).toBe(
      false
    )
    expect(
      calls
        .slice(1)
        .every(
          (call) =>
            new Headers(call.init?.headers).get("Authorization") ===
            `Bearer ${token}`
        )
    ).toBe(true)
    expect(calls.every((call) => call.init?.redirect === "manual")).toBe(true)
    expect(JSON.parse(String(calls[1]?.init?.body))).toMatchObject({
      encryption: "encrypted-remote-v1",
    })
  })

  it.each(["authority", "management", "template"])(
    "rejects foreign %s before transmitting the token",
    async (field) => {
      const data = discovery()
      if (field === "authority")
        data.authentication.authority = "https://other.example"
      if (field === "management")
        data.management.repositories =
          "https://other.example/api/graft/repositories"
      if (field === "template")
        data.remote_url_template = "https://other.example/personal/{repository}"
      const fetchImpl = vi.fn(async () => Response.json(data))
      await expect(
        new CustomSyncClient(origin, fetchImpl).listRepositories(token)
      ).rejects.toMatchObject({ code: "invalid-discovery" })
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  )

  it("rejects redirects, foreign repository URLs, and changed encrypted identities", async () => {
    const redirect = new CustomSyncClient(
      origin,
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://other.example" },
        })
    )
    await expect(redirect.listRepositories(token)).rejects.toMatchObject({
      code: "invalid-discovery",
    })
    const foreign = new CustomSyncClient(origin, async (input) =>
      String(input).endsWith("/.well-known/graft")
        ? Response.json(discovery())
        : Response.json({
            namespace: "personal",
            repositories: [
              {
                ...repository(),
                remote_url: "https://other.example/personal/notes",
              },
            ],
          })
    )
    await expect(foreign.listRepositories(token)).rejects.toMatchObject({
      code: "invalid-response",
    })
    const changed = new CustomSyncClient(origin, async (input) =>
      String(input).endsWith("/.well-known/graft")
        ? Response.json(discovery())
        : Response.json({ protocol: "graft-remote", version: 1, encryption })
    )
    await expect(
      changed.verifyRepository(`${origin}/personal/notes`, token, {
        ...encryption,
        profile: "encrypted-remote-v1",
        uuid: "10010203-0405-4607-8809-0a0b0c0d0e0f",
      })
    ).rejects.toMatchObject({ code: "invalid-response" })
  })

  it("allows listing plain repositories without admitting them as encrypted connections", async () => {
    const client = new CustomSyncClient(origin, async (input) =>
      String(input).endsWith("/.well-known/graft")
        ? Response.json(discovery())
        : String(input).endsWith("/api/graft/repositories")
          ? Response.json({
              namespace: "personal",
              repositories: [{ ...repository(), encryption: null }],
            })
          : Response.json({ protocol: "graft-remote", version: 1 })
    )
    expect(
      (await client.listRepositories(token)).repositories[0]?.encryption
    ).toBeUndefined()
    await expect(
      client.verifyRepository(`${origin}/personal/notes`, token)
    ).rejects.toMatchObject({ code: "invalid-response" })
  })

  it("bounds unknown-length management responses and does not expose server error bodies", async () => {
    const client = new CustomSyncClient(
      origin,
      async () => new Response("x".repeat(1024 * 1024 + 1))
    )
    await expect(client.discover()).rejects.toMatchObject({
      code: "invalid-response",
    })
    const error = new CustomSyncClient(
      origin,
      async () => new Response(token, { status: 401 })
    )
    await expect(error.discover()).rejects.not.toThrow(token)
  })

  it.each([
    "http://remote.example",
    "https://user:password@personal.example",
    `${origin}/path`,
    `${origin}/?key=secret`,
  ])("rejects unsafe server address %s", (url) => {
    expect(() => customSyncOrigin(url)).toThrow()
  })
  it("accepts HTTP only through an explicit development loopback option", () => {
    expect(() => customSyncOrigin("http://127.0.0.1:8787")).toThrow()
    expect(customSyncOrigin("http://127.0.0.1:8787", true)).toBe(
      "http://127.0.0.1:8787"
    )
    expect(() => customSyncOrigin("http://192.168.1.2:8787", true)).toThrow()
  })
})
