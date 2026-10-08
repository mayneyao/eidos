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
        // Metadata probes must release tunnel slots before another Graft
        // executor uploads. Ordinary artifact requests retain their pool.
        for (const method of ["GET", "HEAD"] as const) {
          expect(
            await connectionHeader(
              "/peer/incoming/raw/store/segments/probe",
              method
            )
          ).toBe("close")
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
      expect(prepared.value).toEqual({ state: "ready", protocol: 2 })
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
      expect(completed.value).toEqual({ state: "ready", protocol: 2 })
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
      expect((await call("/sync", token, { incoming: true })).value).toEqual({
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
})
