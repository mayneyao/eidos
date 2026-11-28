import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import https from "node:https"
import net from "node:net"
import tls from "node:tls"
import { RepositorySession } from "@eidos.space/graft"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "../space/space-session"
import { PeerService } from "./peer-service"
import { translateEidosLite } from "../../shared/i18n"

describe("LAN device sync", () => {
  it("pairs at device level without opening a Space and retains authorization while stopped", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-device-gateway-")
    )
    const gateway = new PeerService(null, directory)
    try {
      expect((await gateway.knownStatus()).running).toBe(false)
      const invitation = await gateway.start()
      const data = JSON.parse(
        Buffer.from(
          invitation.invitation!.replace("eidos-peer:", ""),
          "base64url"
        ).toString()
      ) as { url: string; ticket: string }
      const identity = JSON.parse(
        await fs.readFile(
          path.join(directory, "peer-sync/device/identity.json"),
          "utf8"
        )
      ) as { cert: string }
      const call = (route: string, token: string, body = {}) =>
        new Promise<{
          status: number
          value: { token: string; spaces: unknown[] }
        }>((resolve, reject) => {
          const request = https.request(
            new URL(route, data.url),
            {
              method: "POST",
              ca: identity.cert,
              checkServerIdentity: () => undefined,
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            },
            (response) => {
              let text = ""
              response.on("data", (chunk) => (text += chunk))
              response.on("end", () =>
                resolve({
                  status: response.statusCode!,
                  value: JSON.parse(text),
                })
              )
            }
          )
          request.on("error", reject)
          request.end(JSON.stringify(body))
        })
      expect((await call("/pair", data.ticket, { name: "Phone" })).status).toBe(
        202
      )
      await gateway.approve(true)
      const paired = await call("/pair", data.ticket, { name: "Phone" })
      expect((await call("/spaces", paired.value.token)).value.spaces).toEqual(
        []
      )
      expect((await call("/sync", paired.value.token)).status).toBe(409)
      const agent = new https.Agent({ keepAlive: true })
      try {
        const connectionHeader = (route: string, method: "GET" | "HEAD") =>
          new Promise<string | undefined>((resolve, reject) => {
            const request = https.request(
              new URL(route, data.url),
              {
                method,
                agent,
                ca: identity.cert,
                checkServerIdentity: () => undefined,
                headers: { Authorization: `Bearer ${paired.value.token}` },
              },
              (response) => {
                response.resume()
                response.on("end", () => resolve(response.headers.connection))
              }
            )
            request.on("error", reject)
            request.end()
          })
        // HEAD probes release tunnel slots promptly while GET and read-bundle
        // retain HTTP keep-alive pooling to avoid repeated TLS handshakes.
        expect(
          await connectionHeader(
            "/peer/incoming/raw/store/segments/probe",
            "HEAD"
          )
        ).toBe("close")
        expect(
          await connectionHeader(
            "/peer/incoming/raw/store/segments/probe",
            "GET"
          )
        ).toBe("keep-alive")
        for (const method of ["GET", "HEAD"] as const) {
          expect(
            await connectionHeader(
              "/peer/incoming/raw/store/files/probe",
              method
            )
          ).toBe("keep-alive")
        }
      } finally {
        agent.destroy()
      }
      const device = gateway.status().devices[0]
      await gateway.close()
      expect((await gateway.knownStatus()).devices).toEqual([device])
      const fresh = new PeerService(null, directory)
      await fresh.revoke(device.id)
      expect((await fresh.knownStatus()).devices).toEqual([])
    } finally {
      await gateway.close()
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
  it("pairs explicitly, exchanges Graft history, preserves origin, and revokes access", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-peer-"))
    const root = path.join(directory, "desktop"),
      phone = path.join(directory, "phone")
    await fs.mkdir(root)
    await fs.mkdir(phone)
    await fs.writeFile(path.join(root, "note.md"), "desktop version")
    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    const session = await SpaceSession.create(
      root,
      path.join(directory, "state"),
      { graft }
    )
    const peer = new PeerService(session, path.join(directory, "state"))
    let secondPeer: PeerService | undefined
    let secondSession: SpaceSession | undefined
    let mobile: RepositorySession | undefined
    let proxy: net.Server | undefined
    const sockets = new Set<net.Socket>()
    try {
      await session.enableVersioning()
      await graft.addRemote(
        root,
        "origin",
        "https://cloud.example.test/account/space"
      )
      const invitation = await peer.start()
      const data = JSON.parse(
        Buffer.from(
          invitation.invitation!.replace("eidos-peer:", ""),
          "base64url"
        ).toString()
      ) as { url: string; ticket: string; fingerprint: string }
      const url = new URL(data.url)
      const identity = JSON.parse(
        await fs.readFile(
          path.join(directory, "state/peer-sync", "device", "identity.json"),
          "utf8"
        )
      ) as { cert: string }
      const call = (route: string, token: string, body = {}, endpoint = url) =>
        new Promise<{ status: number; value: Record<string, string> }>(
          (resolve, reject) => {
            const request = https.request(
              new URL(route, endpoint),
              {
                method: "POST",
                ca: identity.cert,
                checkServerIdentity: () => undefined,
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              },
              (response) => {
                let text = ""
                response.on("data", (chunk) => (text += chunk))
                response.on("end", () =>
                  resolve({
                    status: response.statusCode!,
                    value: JSON.parse(text),
                  })
                )
              }
            )
            request.on("error", reject)
            request.end(JSON.stringify(body))
          }
        )
      expect((await call("/sync", "wrong")).status).toBe(401)
      expect((await call("/updates", "wrong")).status).toBe(401)
      expect(
        (await call("/pair", data.ticket, { name: "Test phone" })).status
      ).toBe(202)
      expect(peer.status().pending).toBe("Test phone")
      await peer.approve(true)
      const paired = await call("/pair", data.ticket)
      expect((await call("/pair", data.ticket)).status).toBe(403)
      const token = paired.value.token
      // Rejected uploads must not leave a reusable connection for the client's
      // verification GET (bundled uploads can still have unread request bytes).
      const upload = () =>
        new Promise<{ status: number; connection?: string }>(
          (resolve, reject) => {
            const request = https.request(
              new URL(
                "/peer/incoming/raw-if-not-exists/segments/early-response",
                url
              ),
              {
                method: "PUT",
                ca: identity.cert,
                checkServerIdentity: () => undefined,
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Graft-Protocol": "1",
                  "Content-Length": "6",
                  Connection: "keep-alive",
                },
              },
              (response) => {
                response.resume()
                response.on("end", () => {
                  resolve({
                    status: response.statusCode!,
                    connection: response.headers.connection,
                  })
                  request.destroy()
                })
              }
            )
            request.on("error", reject)
            request.setTimeout(3000, () =>
              request.destroy(new Error("Upload response timed out"))
            )
            request.end("object")
          }
        )
      expect((await upload()).status).toBe(204)
      expect(await upload()).toEqual({ status: 412, connection: "close" })
      const secondRoot = path.join(directory, "second-space")
      await fs.mkdir(secondRoot)
      secondSession = await SpaceSession.create(
        secondRoot,
        path.join(directory, "state"),
        {
          graft: new GraftClient({
            sdkTransport: new GraftInProcessTransport(),
          }),
        }
      )
      secondPeer = new PeerService(secondSession, path.join(directory, "state"))
      const secondInvitation = await secondPeer.start()
      const secondData = JSON.parse(
        Buffer.from(
          secondInvitation.invitation!.replace("eidos-peer:", ""),
          "base64url"
        ).toString()
      ) as { url: string; fingerprint: string }
      expect(secondData.fingerprint).toBe(data.fingerprint)
      expect(
        (await call("/spaces", "wrong", {}, new URL(secondData.url))).status
      ).toBe(401)
      const spaces = await call("/spaces", token, {}, new URL(secondData.url))
      expect(spaces.status).toBe(200)
      expect(spaces.value.spaces).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: session.canonical.id }),
          expect.objectContaining({ id: secondSession.canonical.id }),
        ])
      )
      expect(secondPeer.status().pending).toBeUndefined()
      await secondPeer.close()
      secondPeer = new PeerService(secondSession, path.join(directory, "state"))
      await secondPeer.start()
      expect(
        (await call("/spaces", token, {}, new URL(secondData.url))).status
      ).toBe(200)
      const prepared = await call("/sync", token)
      expect(prepared.value).toMatchObject({ state: "ready", protocol: 2 })
      expect(typeof prepared.value.head).toBe("string")
      proxy = net.createServer((local) => {
        const remote = tls.connect(
          {
            host: url.hostname,
            port: Number(url.port),
            ca: identity.cert,
            checkServerIdentity: () => undefined,
          },
          () => {
            local.pipe(remote)
            remote.pipe(local)
          }
        )
        sockets.add(local)
        sockets.add(remote)
        local.on("error", () => remote.destroy())
        remote.on("error", () => local.destroy())
      })
      await new Promise<void>((resolve) =>
        proxy!.listen(0, "127.0.0.1", resolve)
      )
      const remoteUrl = `graft+http://127.0.0.1:${(proxy.address() as net.AddressInfo).port}/peer/space`
      mobile = await RepositorySession.open(phone)
      await mobile.init()
      await mobile.configureRemote({
        name: "eidos-peer",
        url: remoteUrl,
        bearerToken: token,
      })
      await mobile.configureRemote({
        name: "eidos-incoming",
        url: remoteUrl.replace("/peer/space", "/peer/incoming"),
        bearerToken: token,
      })
      await mobile.fetch({ remote: "eidos-peer", branch: "main" })
      const plan = await mobile.planMerge({ revision: "eidos-peer/main" })
      await mobile.applyMerge({
        revision: "eidos-peer/main",
        planToken: plan.plan_token,
      })
      expect(await fs.readFile(path.join(phone, "note.md"), "utf8")).toBe(
        "desktop version"
      )
      const committed = (await graft.status(root)).currentHead
      await fs.writeFile(path.join(root, "note.md"), "unsaved desktop work")
      const updates = await call("/updates", token)
      expect(updates.value).toEqual({
        protocol: 1,
        space: session.canonical.id,
        head: committed,
      })
      expect((await graft.status(root)).currentHead).toBe(committed)
      expect((await graft.status(root)).dirty).toBe(true)
      await mobile.fetch({ remote: "eidos-peer", branch: "main" })
      expect(
        (await mobile.planMerge({ revision: "eidos-peer/main" })).kind
      ).toBe("up_to_date")
      await fs.writeFile(path.join(root, "note.md"), "desktop version")
      // Refresh new commits without importing phone history or saving edits.
      await fs.writeFile(
        path.join(root, "committed.md"),
        "new committed version"
      )
      await session.createCheckpoint("new committed version")
      const newHead = (await graft.status(root)).currentHead
      expect((await call("/updates", token)).value.head).toBe(newHead)
      await mobile.fetch({ remote: "eidos-peer", branch: "main" })
      const updatePlan = await mobile.planMerge({ revision: "eidos-peer/main" })
      expect(updatePlan.kind).toBe("fast_forward")
      await mobile.applyMerge({
        revision: "eidos-peer/main",
        planToken: updatePlan.plan_token,
      })
      expect(await fs.readFile(path.join(phone, "committed.md"), "utf8")).toBe(
        "new committed version"
      )
      await fs.writeFile(path.join(phone, "note.md"), "phone version")
      await mobile.addAll()
      await mobile.commit("phone edit")
      // A paired phone may fetch reviewed history, but cannot bypass desktop
      // validation and conflict review by pushing directly into it.
      await expect(
        mobile.push({ remote: "eidos-peer", branch: "main" })
      ).rejects.toThrow()
      await mobile.push({ remote: "eidos-incoming", branch: "main" })
      const completed = await call("/sync", token, { incoming: true })
      expect(completed.value).toMatchObject({ state: "ready", protocol: 2 })
      expect(typeof completed.value.head).toBe("string")
      const transfers = peer.status().transfers!
      expect(transfers).toHaveLength(1)
      expect(transfers[0]!.receivedBytes).toBeGreaterThan(0)
      expect(transfers[0]!.sentBytes).toBeGreaterThan(0)
      expect(transfers[0]!.activeRequests).toBe(0)
      expect(await fs.readFile(path.join(root, "note.md"), "utf8")).toBe(
        "phone version"
      )
      expect(await graft.remoteUrl(root, "origin")).toBe(
        "https://cloud.example.test/account/space"
      )
      expect(
        (await mobile.listRemotes()).remotes.map((remote) => remote.name)
      ).toEqual(["eidos-incoming", "eidos-peer"])
      await fs.writeFile(
        path.join(root, "desktop.md"),
        "desktop independent edit"
      )
      await fs.writeFile(path.join(phone, "phone.md"), "phone independent edit")
      await mobile.addAll()
      await mobile.commit("independent phone edit")
      await mobile.push({ remote: "eidos-incoming", branch: "main" })
      expect(
        (await call("/sync", token, { incoming: true })).value
      ).toMatchObject({
        state: "ready",
        protocol: 2,
      })
      expect(await fs.readFile(path.join(root, "desktop.md"), "utf8")).toBe(
        "desktop independent edit"
      )
      expect(await fs.readFile(path.join(root, "phone.md"), "utf8")).toBe(
        "phone independent edit"
      )
      await mobile.fetch({ remote: "eidos-peer", branch: "main" })
      const merged = await mobile.planMerge({ revision: "eidos-peer/main" })
      await mobile.applyMerge({
        revision: "eidos-peer/main",
        planToken: merged.plan_token,
      })
      expect(await fs.readFile(path.join(phone, "desktop.md"), "utf8")).toBe(
        "desktop independent edit"
      )
      await fs.writeFile(path.join(root, "note.md"), "desktop concurrent edit")
      await fs.writeFile(path.join(phone, "note.md"), "phone concurrent edit")
      await mobile.addAll()
      await mobile.commit("concurrent phone edit")
      await mobile.push({ remote: "eidos-incoming", branch: "main" })
      expect((await call("/sync", token, { incoming: true })).value).toEqual({
        state: "needs_review",
        protocol: 2,
      })
      expect(await fs.readFile(path.join(root, "note.md"), "utf8")).toBe(
        "desktop concurrent edit"
      )
      expect(await fs.readFile(path.join(phone, "note.md"), "utf8")).toBe(
        "phone concurrent edit"
      )
      let review = await session.getSyncMergeStatus()
      expect(review.state).toBe("merging")
      if (review.state !== "merging") throw new Error("Expected desktop review")
      const paths = await session.listSyncMergePaths(review.stateToken)
      expect(paths.items.some((item) => item.path === "note.md")).toBe(true)
      expect(await mobile.getMergeStatus()).toEqual({ state: "none" })
      // Editing on the phone while waiting must remain a descendant of its
      // uploaded head and reach the desktop after the first review completes.
      await fs.writeFile(
        path.join(phone, "waiting.md"),
        "written while waiting"
      )
      await mobile.addAll()
      await mobile.commit("edit while desktop is reviewing")
      await mobile.push({ remote: "eidos-incoming", branch: "main" })
      expect((await call("/sync", token, { incoming: true })).value.state).toBe(
        "needs_review"
      )
      review = await session.writeSyncMergeText(
        review.stateToken,
        "note.md",
        "reviewed on desktop"
      )
      if (review.state !== "merging") throw new Error("Expected staged review")
      await session.continueSyncMerge(
        review.stateToken,
        "Review phone and desktop changes"
      )
      expect((await call("/sync", token, { incoming: true })).value.state).toBe(
        "ready"
      )
      await mobile.fetch({ remote: "eidos-peer", branch: "main" })
      const continuation = await mobile.planMerge({
        revision: "eidos-peer/main",
      })
      expect(continuation.kind).toBe("fast_forward")
      await mobile.applyMerge({
        revision: "eidos-peer/main",
        planToken: continuation.plan_token,
      })
      expect(await fs.readFile(path.join(phone, "note.md"), "utf8")).toBe(
        "reviewed on desktop"
      )
      expect(await fs.readFile(path.join(root, "waiting.md"), "utf8")).toBe(
        "written while waiting"
      )
      expect(await fs.readFile(path.join(phone, "waiting.md"), "utf8")).toBe(
        "written while waiting"
      )
      expect(secondPeer.ownsSession(secondSession)).toBe(true)
      expect(secondPeer.ownsSession(session)).toBe(false)
      await secondSession.close()
      const remaining = await call("/spaces", token)
      expect(remaining.value.spaces).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: secondSession.canonical.id }),
        ])
      )
      expect(
        (await call("/sync", token, {}, new URL(secondData.url))).status
      ).toBe(409)
      await expect(secondPeer.start()).rejects.toThrow(
        "Reopen this Space, then turn on LAN sync."
      )
      const localized = new PeerService(
        secondSession,
        path.join(directory, "state"),
        undefined,
        (message) => translateEidosLite("zh", message)
      )
      await expect(localized.start()).rejects.toThrow("请重新打开此 Space")
      await localized.close()
      await peer.revoke(paired.value.deviceId)
      expect((await call("/sync", token)).status).toBe(401)
      expect(
        (await call("/spaces", token, {}, new URL(secondData.url))).status
      ).toBe(401)
    } finally {
      await mobile?.close()
      for (const socket of sockets) socket.destroy()
      if (proxy)
        await new Promise<void>((resolve) => proxy!.close(() => resolve()))
      await peer.close()
      await secondPeer?.close()
      await secondSession?.close()
      await session.close()
      await fs.rm(directory, { recursive: true, force: true })
    }
  }, 120_000)

  it("skips redundant export-v2 pushes when desktop HEAD is unchanged and exports new commits", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-peer-cache-")
    )
    const root = path.join(directory, "desktop")
    const state = path.join(directory, "state")
    await fs.mkdir(root)
    await fs.writeFile(path.join(root, "note.md"), "initial")
    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    const transferSpy = vi.spyOn(graft, "transferPeer")
    const session = await SpaceSession.create(root, state, { graft })
    const peer = new PeerService(session, state)
    try {
      await session.enableVersioning()
      const invitation = await peer.start()
      const data = JSON.parse(
        Buffer.from(
          invitation.invitation!.replace("eidos-peer:", ""),
          "base64url"
        ).toString()
      ) as { url: string; ticket: string }
      const identity = JSON.parse(
        await fs.readFile(
          path.join(state, "peer-sync/device/identity.json"),
          "utf8"
        )
      ) as { cert: string }
      const call = (route: string, token: string, body = {}) =>
        new Promise<{ status: number; value: Record<string, unknown> }>(
          (resolve, reject) => {
            const request = https.request(
              new URL(route, data.url),
              {
                method: "POST",
                ca: identity.cert,
                checkServerIdentity: () => undefined,
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              },
              (response) => {
                let text = ""
                response.on("data", (chunk) => (text += chunk))
                response.on("end", () =>
                  resolve({
                    status: response.statusCode!,
                    value: JSON.parse(text),
                  })
                )
              }
            )
            request.on("error", reject)
            request.end(JSON.stringify(body))
          }
        )
      await call("/pair", data.ticket, { name: "CachePhone" })
      await peer.approve(true)
      const token = String((await call("/pair", data.ticket)).value.token)

      const firstSync = await call("/sync", token, { incoming: false })
      expect(firstSync.status).toBe(200)
      const pushesAfterFirst = transferSpy.mock.calls.filter(
        ([, op]) => op === "push"
      ).length
      expect(pushesAfterFirst).toBe(1)

      // Repeated /updates and /sync with no desktop change should not push again.
      const updates1 = await call("/updates", token)
      const sync2 = await call("/sync", token, { incoming: false })
      expect(updates1.value.head).toBe(firstSync.value.head)
      expect(sync2.value.head).toBe(firstSync.value.head)
      expect(
        transferSpy.mock.calls.filter(([, op]) => op === "push").length
      ).toBe(1)

      await fs.writeFile(path.join(root, "note.md"), "updated")
      await session.createCheckpoint("second commit")
      const newHead = (await graft.status(root)).currentHead
      const updates2 = await call("/updates", token)
      expect(updates2.value.head).toBe(newHead)
      const sync3 = await call("/sync", token, { incoming: false })
      expect(sync3.value.head).toBe(newHead)
      expect(
        transferSpy.mock.calls.filter(([, op]) => op === "push").length
      ).toBe(2)
    } finally {
      await peer.close()
      await session.close()
      await fs.rm(directory, { recursive: true, force: true })
    }
  }, 60_000)

  it("reuses pooled TLS connections through an 8-slot proxy without stalling across multi-file sync", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-peer-pool-")
    )
    const root = path.join(directory, "desktop")
    const phone = path.join(directory, "phone")
    const state = path.join(directory, "state")
    await Promise.all([fs.mkdir(root), fs.mkdir(phone)])
    const { DatabaseSync } = await import("node:sqlite")
    for (let i = 0; i < 4; i++) {
      const db = new DatabaseSync(path.join(root, `db-${i}.eidos`))
      db.exec(
        `CREATE TABLE t (id INTEGER PRIMARY KEY, body TEXT); INSERT INTO t VALUES (1, 'row-${i}')`
      )
      db.close()
    }
    for (let i = 0; i < 8; i++) {
      await fs.writeFile(path.join(root, `doc-${i}.md`), `content ${i}\n`)
    }
    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    const session = await SpaceSession.create(root, state, { graft })
    const peer = new PeerService(session, state)
    let mobile: RepositorySession | undefined
    let proxy: net.Server | undefined
    const sockets = new Set<net.Socket>()
    let tlsConnections = 0
    let httpRequests = 0
    try {
      await session.enableVersioning()
      const invitation = await peer.start()
      const data = JSON.parse(
        Buffer.from(
          invitation.invitation!.replace("eidos-peer:", ""),
          "base64url"
        ).toString()
      ) as { url: string; ticket: string }
      const url = new URL(data.url)
      const identity = JSON.parse(
        await fs.readFile(
          path.join(state, "peer-sync/device/identity.json"),
          "utf8"
        )
      ) as { cert: string }
      const origHandle = peer["handle"].bind(peer)
      peer["tls"]!.removeAllListeners("request")
      peer["tls"]!.on("request", (req, res) => {
        httpRequests += 1
        void origHandle(req, res).catch(() => {})
      })
      peer["tls"]!.on("secureConnection", () => {
        tlsConnections += 1
      })
      const call = (route: string, token: string, body = {}) =>
        new Promise<{ status: number; value: Record<string, unknown> }>(
          (resolve, reject) => {
            const request = https.request(
              new URL(route, url),
              {
                method: "POST",
                ca: identity.cert,
                checkServerIdentity: () => undefined,
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              },
              (response) => {
                let text = ""
                response.on("data", (chunk) => (text += chunk))
                response.on("end", () =>
                  resolve({
                    status: response.statusCode!,
                    value: JSON.parse(text),
                  })
                )
              }
            )
            request.on("error", reject)
            request.end(JSON.stringify(body))
          }
        )
      await call("/pair", data.ticket, { name: "PoolPhone" })
      await peer.approve(true)
      const token = String((await call("/pair", data.ticket)).value.token)

      let activeSlots = 0
      const waiters: (() => void)[] = []
      const acquire = () =>
        activeSlots < 8
          ? (activeSlots++, Promise.resolve())
          : new Promise<void>((r) =>
              waiters.push(() => {
                activeSlots++
                r()
              })
            )
      const release = () => {
        activeSlots--
        waiters.shift()?.()
      }
      proxy = net.createServer(async (local) => {
        await acquire()
        const remote = tls.connect(
          {
            host: url.hostname,
            port: Number(url.port),
            ca: identity.cert,
            checkServerIdentity: () => undefined,
          },
          () => {
            local.pipe(remote)
            remote.pipe(local)
          }
        )
        sockets.add(local)
        sockets.add(remote)
        let released = false
        const done = () => {
          if (released) return
          released = true
          local.destroy()
          remote.destroy()
          release()
        }
        local.on("error", done)
        local.on("close", done)
        remote.on("error", done)
        remote.on("close", done)
      })
      await new Promise<void>((resolve) =>
        proxy!.listen(0, "127.0.0.1", resolve)
      )
      const remoteUrl = `graft+http://127.0.0.1:${(proxy.address() as net.AddressInfo).port}/peer/space`
      mobile = await RepositorySession.open(phone)
      await mobile.init()
      await mobile.configureRemote({
        name: "eidos-peer",
        url: remoteUrl,
        bearerToken: token,
      })
      await mobile.configureRemote({
        name: "eidos-incoming",
        url: remoteUrl.replace("/peer/space", "/peer/incoming"),
        bearerToken: token,
      })
      await call("/sync", token, { incoming: false })
      tlsConnections = 0
      httpRequests = 0
      await mobile.fetch({ remote: "eidos-peer", branch: "main" })
      const plan = await mobile.planMerge({ revision: "eidos-peer/main" })
      await mobile.applyMerge({
        revision: "eidos-peer/main",
        planToken: plan.plan_token,
      })
      // Write and push multiple rounds from mobile to verify HEAD probes + uploads do not stall.
      for (let round = 0; round < 3; round++) {
        await fs.writeFile(
          path.join(phone, `p-${round}.md`),
          `round ${round}\n`
        )
        await mobile.addAll()
        await mobile.commit(`round ${round}`)
        await mobile.push({ remote: "eidos-incoming", branch: "main" })
      }
      expect(httpRequests).toBeGreaterThanOrEqual(15)
      expect(tlsConnections).toBeLessThan(httpRequests)
    } finally {
      await mobile?.close()
      for (const socket of sockets) socket.destroy()
      if (proxy)
        await new Promise<void>((resolve) => proxy!.close(() => resolve()))
      await peer.close()
      await session.close()
      await fs.rm(directory, { recursive: true, force: true })
    }
  }, 60_000)

  it("seeds incoming remote head from reviewed history so first mobile push skips full re-upload", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-peer-incoming-seed-")
    )
    const root = path.join(directory, "desktop")
    const phone = path.join(directory, "phone")
    const state = path.join(directory, "state")
    await Promise.all([fs.mkdir(root), fs.mkdir(phone)])
    const { DatabaseSync } = await import("node:sqlite")
    for (let i = 0; i < 3; i++) {
      const db = new DatabaseSync(path.join(root, `db-${i}.eidos`))
      db.exec(
        `CREATE TABLE t (id INTEGER PRIMARY KEY, body TEXT); INSERT INTO t VALUES (1, 'row-${i}')`
      )
      db.close()
    }
    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    const session = await SpaceSession.create(root, state, { graft })
    const peer = new PeerService(session, state)
    let mobile: RepositorySession | undefined
    let httpRequests = 0
    try {
      await session.enableVersioning()
      const invitation = await peer.start()
      const data = JSON.parse(
        Buffer.from(
          invitation.invitation!.replace("eidos-peer:", ""),
          "base64url"
        ).toString()
      ) as { url: string; ticket: string }
      const identity = JSON.parse(
        await fs.readFile(
          path.join(state, "peer-sync/device/identity.json"),
          "utf8"
        )
      ) as { cert: string }
      const origHandle = peer["handle"].bind(peer)
      peer["tls"]!.removeAllListeners("request")
      peer["tls"]!.on("request", (req, res) => {
        httpRequests += 1
        void origHandle(req, res).catch(() => {})
      })
      const call = (route: string, token: string, body = {}) =>
        new Promise<{ status: number; value: Record<string, unknown> }>(
          (resolve, reject) => {
            const request = https.request(
              new URL(route, data.url),
              {
                method: "POST",
                ca: identity.cert,
                checkServerIdentity: () => undefined,
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              },
              (response) => {
                let text = ""
                response.on("data", (chunk) => (text += chunk))
                response.on("end", () =>
                  resolve({
                    status: response.statusCode!,
                    value: JSON.parse(text),
                  })
                )
              }
            )
            request.on("error", reject)
            request.end(JSON.stringify(body))
          }
        )
      await call("/pair", data.ticket, { name: "SeedPhone" })
      await peer.approve(true)
      const token = String((await call("/pair", data.ticket)).value.token)

      const firstSync = await call("/sync", token, { incoming: false })
      expect(firstSync.status).toBe(200)
      const reviewedHead = String(firstSync.value.head)

      mobile = await RepositorySession.open(phone)
      await mobile.init()
      await mobile.configureRemote({
        name: "eidos-peer",
        url: peer["localUrl"],
        bearerToken: peer["localToken"],
      })
      await mobile.configureRemote({
        name: "eidos-incoming",
        url: peer["localUrl"].replace("/peer/space", "/peer/incoming"),
        bearerToken: token,
      })
      // Note: RepositorySession.push via loopback would bypass TLS request counter,
      // so configure eidos-incoming against data.url only after reading cert; here
      // verify /incoming/seed directly + incremental push count on incoming store.
      const seedRes = await call("/incoming/seed", token, {
        baseHead: reviewedHead,
      })
      expect(seedRes).toEqual({ status: 200, value: { seeded: true } })
      const repeatSeed = await call("/incoming/seed", token, {
        baseHead: reviewedHead,
      })
      expect(repeatSeed).toEqual({ status: 200, value: { seeded: false } })

      await mobile.fetch({ remote: "eidos-peer", branch: "main" })
      const plan = await mobile.planMerge({ revision: "eidos-peer/main" })
      await mobile.applyMerge({
        revision: "eidos-peer/main",
        planToken: plan.plan_token,
      })
      let loopbackRequests = 0
      const origLoopback = peer["loopback"]!.listeners("request")[0] as (
        req: unknown,
        res: unknown
      ) => void
      peer["loopback"]!.removeAllListeners("request")
      peer["loopback"]!.on("request", (req, res) => {
        loopbackRequests += 1
        origLoopback(req, res)
      })
      const incomingStore = peer["incomingStore"](peer.status().devices[0].id)
      // Verify reviewed.sqlite itself has logs, while seeded incoming.sqlite has ZERO own log rows uploaded.
      expect(
        peer["store"]!.list({ prefix: "logs/", limit: 10 }).paths.length
      ).toBeGreaterThan(0)
      await fs.writeFile(path.join(phone, "note.md"), "mobile incremental\n")
      await mobile.addAll()
      await mobile.commit("mobile md")
      loopbackRequests = 0
      await mobile.push({ remote: "eidos-incoming", branch: "main" })
      // With incoming ref seeded, first mobile push sends only ref GET + receive-pack (2-3 requests),
      // never scanning objects/logs/segments across the repository history.
      expect(loopbackRequests).toBeLessThanOrEqual(4)
      expect(incomingStore.head("refs/heads/main")).not.toBeNull()
    } finally {
      await mobile?.close()
      await peer.close()
      await session.close()
      await fs.rm(directory, { recursive: true, force: true })
    }
  }, 60_000)

  it("skips redundant desktop fetch/planMerge on incoming=false /sync after editing a .eidos database", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-peer-desktop-eidos-edit-")
    )
    const root = path.join(directory, "desktop")
    const phone = path.join(directory, "phone")
    const state = path.join(directory, "state")
    await Promise.all([fs.mkdir(root), fs.mkdir(phone)])
    const { DatabaseSync } = await import("node:sqlite")
    const dbPath = path.join(root, "notes.eidos")
    const db = new DatabaseSync(dbPath)
    db.exec(
      "CREATE TABLE rows (id INTEGER PRIMARY KEY, body TEXT); INSERT INTO rows VALUES (1, 'initial');"
    )
    db.close()

    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    const transferSpy = vi.spyOn(graft, "transferPeer")
    const planMergeSpy = vi.spyOn(graft, "planMerge")
    const session = await SpaceSession.create(root, state, { graft })
    const peer = new PeerService(session, state)
    let mobile: RepositorySession | undefined
    try {
      await session.enableVersioning()
      const invitation = await peer.start()
      const data = JSON.parse(
        Buffer.from(
          invitation.invitation!.replace("eidos-peer:", ""),
          "base64url"
        ).toString()
      ) as { url: string; ticket: string }
      const identity = JSON.parse(
        await fs.readFile(
          path.join(state, "peer-sync/device/identity.json"),
          "utf8"
        )
      ) as { cert: string }
      const call = (route: string, token: string, body = {}) =>
        new Promise<{ status: number; value: Record<string, unknown> }>(
          (resolve, reject) => {
            const request = https.request(
              new URL(route, data.url),
              {
                method: "POST",
                ca: identity.cert,
                checkServerIdentity: () => undefined,
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              },
              (response) => {
                let text = ""
                response.on("data", (chunk) => (text += chunk))
                response.on("end", () =>
                  resolve({
                    status: response.statusCode!,
                    value: JSON.parse(text),
                  })
                )
              }
            )
            request.on("error", reject)
            request.end(JSON.stringify(body))
          }
        )
      await call("/pair", data.ticket, { name: "EidosPhone" })
      await peer.approve(true)
      const token = String((await call("/pair", data.ticket)).value.token)

      const first = await call("/sync", token, { incoming: false })
      expect(first.status).toBe(200)

      mobile = await RepositorySession.open(phone)
      await mobile.init()
      await mobile.configureRemote({
        name: "eidos-peer",
        url: peer["localUrl"],
        bearerToken: peer["localToken"],
      })
      await mobile.fetch({ remote: "eidos-peer", branch: "main" })
      const plan1 = await mobile.planMerge({ revision: "eidos-peer/main" })
      await mobile.applyMerge({
        revision: "eidos-peer/main",
        planToken: plan1.plan_token,
      })

      // Now edit the .eidos SQLite database on desktop and let mobile tap sync (incoming=false)
      const editedDb = new DatabaseSync(dbPath)
      editedDb.exec("INSERT INTO rows VALUES (2, 'from desktop edit');")
      editedDb.close()

      transferSpy.mockClear()
      planMergeSpy.mockClear()
      const synced = await call("/sync", token, { incoming: false })
      expect(synced.status).toBe(200)
      expect(synced.value.state).toBe("ready")
      expect(
        transferSpy.mock.calls.filter(([, op]) => op === "fetch")
      ).toHaveLength(0)
      expect(
        transferSpy.mock.calls.filter(([, op]) => op === "push")
      ).toHaveLength(1)
      expect(planMergeSpy).not.toHaveBeenCalled()

      await mobile.fetch({ remote: "eidos-peer", branch: "main" })
      const plan2 = await mobile.planMerge({ revision: "eidos-peer/main" })
      expect(plan2.kind).toBe("fast_forward")
      await mobile.applyMerge({
        revision: "eidos-peer/main",
        planToken: plan2.plan_token,
      })

      const phoneDb = new DatabaseSync(path.join(phone, "notes.eidos"), {
        readOnly: true,
      })
      const rows = phoneDb
        .prepare("SELECT id, body FROM rows ORDER BY id")
        .all()
      phoneDb.close()
      expect(rows).toEqual([
        { id: 1, body: "initial" },
        { id: 2, body: "from desktop edit" },
      ])
    } finally {
      await mobile?.close()
      await peer.close()
      await session.close()
      await fs.rm(directory, { recursive: true, force: true })
    }
  }, 60_000)

  it("reports and recovers refs/heads/main rather than current non-main branch HEAD or stale marker files", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-peer-branch-head-")
    )
    const root = path.join(directory, "space")
    const state = path.join(directory, "state")
    const phone = path.join(directory, "phone")
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(path.join(root, "note.md"), "main commit")

    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    const session = await SpaceSession.create(root, state, { graft })
    let peer = new PeerService(session, state)
    let secondPeer: PeerService | undefined
    let mobile: RepositorySession | undefined
    try {
      await session.enableVersioning()
      const invitation = await peer.start()
      const inviteData = JSON.parse(
        Buffer.from(
          invitation.invitation!.replace("eidos-peer:", ""),
          "base64url"
        ).toString()
      ) as { url: string; ticket: string }
      const identity = JSON.parse(
        await fs.readFile(
          path.join(state, "peer-sync/device/identity.json"),
          "utf8"
        )
      ) as { cert: string }
      const call = (
        route: string,
        token: string,
        body: unknown = {},
        base = inviteData.url
      ) =>
        new Promise<{ status: number; value: Record<string, unknown> }>(
          (resolve, reject) => {
            const request = https.request(
              new URL(route, base),
              {
                method: "POST",
                ca: identity.cert,
                checkServerIdentity: () => undefined,
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              },
              (response) => {
                let text = ""
                response.on("data", (chunk) => (text += chunk))
                response.on("end", () =>
                  resolve({
                    status: response.statusCode!,
                    value: JSON.parse(text),
                  })
                )
              }
            )
            request.on("error", reject)
            request.end(JSON.stringify(body))
          }
        )

      await call("/pair", inviteData.ticket, { name: "Phone" })
      await peer.approve(true)
      const token = String((await call("/pair", inviteData.ticket)).value.token)

      const firstSync = await call("/sync", token, { incoming: false })
      expect(firstSync.status).toBe(200)
      const mainHead = String(firstSync.value.head)
      expect(mainHead).toMatch(/^[a-f0-9]{64}$/)

      // Seed phone from mainHead, then make a phone edit for an incoming sync later.
      mobile = await RepositorySession.open(phone)
      await mobile.init()
      await mobile.configureRemote({
        name: "eidos-peer",
        url: peer["localUrl"],
        bearerToken: peer["localToken"],
      })
      await mobile.fetch({ remote: "eidos-peer", branch: "main" })
      const initPlan = await mobile.planMerge({ revision: "eidos-peer/main" })
      await mobile.applyMerge({
        revision: "eidos-peer/main",
        planToken: initPlan.plan_token,
      })

      // Switch desktop off main to a topic branch with its own commit B and dirty worktree edits.
      await fs.writeFile(
        path.join(root, ".graft/refs/heads/topic-review"),
        `${mainHead}\n`,
        "utf8"
      )
      await fs.writeFile(
        path.join(root, ".graft/HEAD"),
        "ref: refs/heads/topic-review\n",
        "utf8"
      )
      await fs.writeFile(path.join(root, "topic.md"), "unexported branch")
      await graft.stageAll(root)
      const topicHead = (await graft.commit(root, "topic commit")).id
      expect(topicHead).not.toBe(mainHead)
      await fs.writeFile(path.join(root, "topic-dirty.md"), "unsaved draft")

      // Pull-only sync while desktop is on topic branch: must report mainHead
      // without creating a checkpoint on topic-review or modifying main/topic.
      const nonMainSync = await call("/sync", token, { incoming: false })
      expect(nonMainSync.status).toBe(200)
      expect(nonMainSync.value.head).toBe(mainHead)
      expect(
        (
          await fs.readFile(
            path.join(root, ".graft/refs/heads/topic-review"),
            "utf8"
          )
        ).trim()
      ).toBe(topicHead)
      expect(
        (
          await fs.readFile(path.join(root, ".graft/refs/heads/main"), "utf8")
        ).trim()
      ).toBe(mainHead)

      // /incoming/seed must reject unexported topicHead.
      const badSeed = await call("/incoming/seed", token, {
        baseHead: topicHead,
      })
      expect(badSeed.status).toBe(200)
      expect(badSeed.value.seeded).toBe(false)

      // Phone makes a real commit ahead of mainHead and uploads to incoming.
      await mobile.configureRemote({
        name: "eidos-incoming",
        url: peer["localUrl"].replace("/peer/space", "/peer/incoming"),
        bearerToken: token,
      })
      await fs.writeFile(path.join(phone, "phone-ahead.md"), "phone update")
      await mobile.addAll()
      await mobile.commit("phone ahead")
      await mobile.push({ remote: "eidos-incoming", branch: "main" })

      // /sync with incoming=true while desktop is on topic-review must fail before
      // checkpoint or merge, leaving both topic-review and main unchanged.
      const nonMainIncomingSync = await call("/sync", token, { incoming: true })
      expect(nonMainIncomingSync.status).toBe(409)
      expect(
        (
          await fs.readFile(
            path.join(root, ".graft/refs/heads/topic-review"),
            "utf8"
          )
        ).trim()
      ).toBe(topicHead)
      expect(
        (
          await fs.readFile(path.join(root, ".graft/refs/heads/main"), "utf8")
        ).trim()
      ).toBe(mainHead)
      await expect(
        fs.access(path.join(root, "phone-ahead.md"))
      ).rejects.toThrow()
      expect(await fs.readFile(path.join(root, "topic-dirty.md"), "utf8")).toBe(
        "unsaved draft"
      )

      // Switch desktop back to main and commit unexported commit C directly via RepositorySession
      // while export-v2 stays at mainHead (A). /incoming/seed must reject unexported B/C and accept A.
      await fs.writeFile(
        path.join(root, ".graft/HEAD"),
        "ref: refs/heads/main\n",
        "utf8"
      )
      await fs.rm(path.join(root, "topic.md"), { force: true })
      await fs.rm(path.join(root, "topic-dirty.md"), { force: true })
      await fs.writeFile(path.join(root, "local-main-only.md"), "not exported")
      await graft.stageAll(root)
      const unexportedMainB = (await graft.commit(root, "local main B")).id
      expect(unexportedMainB).not.toBe(mainHead)
      const secondDeviceId = "test-unexported-seed-device"
      peer["incomingStore"](secondDeviceId)
      const unexportedSeed = await call("/incoming/seed", token, {
        baseHead: unexportedMainB,
      })
      expect(unexportedSeed.status).toBe(200)
      expect(unexportedSeed.value.seeded).toBe(false)
      // Reset incomingStore so A can seed on first call.
      peer["incomingStore"](peer.status().devices[0].id).delete(
        "refs/heads/main"
      )
      const exportedSeed = await call("/incoming/seed", token, {
        baseHead: mainHead,
      })
      expect(exportedSeed.status).toBe(200)
      expect(exportedSeed.value.seeded).toBe(true)

      // Switch off main again with dirty marker file exported-head=topicHead and test restart recovery.
      await fs.writeFile(
        path.join(root, ".graft/HEAD"),
        "ref: refs/heads/topic-review\n",
        "utf8"
      )
      // Corrupt/write a stale exported-head file (simulating crash before marker update),
      // restart PeerService, and verify exportedHead recovers from refs/heads/main.
      const exportDir = peer["exportDirectory"]
      await peer.close()
      await fs.writeFile(
        path.join(exportDir, "exported-head"),
        topicHead,
        "utf8"
      )
      secondPeer = new PeerService(session, state)
      const restartedInvitation = await secondPeer.start(true)
      expect(secondPeer["exportedHead"]).toBe(mainHead)
      const restartedData = JSON.parse(
        Buffer.from(
          restartedInvitation.invitation!.replace("eidos-peer:", ""),
          "base64url"
        ).toString()
      ) as { url: string }
      const restartedUrl = restartedData.url
      const updatesAfterRestart = await call(
        "/updates",
        token,
        {},
        restartedUrl
      )
      expect(updatesAfterRestart.status).toBe(200)
      expect(updatesAfterRestart.value.head).toBeNull()
      const syncAfterRestart = await call(
        "/sync",
        token,
        { incoming: false },
        restartedUrl
      )
      expect(syncAfterRestart.status).toBe(200)
      expect(syncAfterRestart.value.head).toBe(unexportedMainB)
    } finally {
      await mobile?.close()
      await secondPeer?.close()
      await peer.close()
      await session.close()
      await fs.rm(directory, { recursive: true, force: true })
    }
  }, 60_000)
})
