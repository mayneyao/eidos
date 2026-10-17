import { execFile } from "node:child_process"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { app, net, safeStorage } from "electron"
import { SecureAccountCredentialStore } from "../account/credential-store"
import { createRememberedSyncUnlocks } from "./create-remembered-sync-unlocks"
import { RememberedSyncUnlockStore } from "./remembered-sync-unlocks"
import { createSyncControlPlane } from "./create-sync-control-plane"
import type { FileEntry } from "@eidos.space/eidos-file"
import {
  EIDOS_LITE_SERVICE_ENVIRONMENTS,
  resolveEidosLiteServiceEnvironment,
  runtimeEnvironmentOverride,
} from "../../shared/service-environment"
import {
  assertPrivateStagingPath,
  stagingFixtureCli,
} from "./encrypted-staging-smoke-policy"
import type { GraftEncryptedInput } from "../../shared/graft-sdk-contracts"
import { GraftClient } from "../graft/graft-client"
import { assertSpaceRepositoryBoundary } from "../graft/space-repository-boundary"
import { GraftUtilityTransport } from "../graft/graft-utility-transport"
import { SpaceSession } from "../space/space-session"
import { resolveEidosFileAttachment } from "../space/eidos-file-attachments"
import { RuntimePool } from "../runtime/runtime-pool"
import { OfficialSyncClient } from "./official-sync-client"
import { SpaceCloneCoordinator } from "./space-clone-coordinator"
import { classifySyncFailure } from "./sync-failure"

const execute = promisify(execFile)
function fixtureCli(): string {
  return stagingFixtureCli(app.isPackaged, process.resourcesPath)
}
async function cli<Result>(args: string[]): Promise<Result> {
  const { stdout } = await execute(fixtureCli(), ["--json", ...args], {
    maxBuffer: 4 * 1024 * 1024,
  })
  return JSON.parse(stdout) as Result
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex")
async function attachmentDigest(
  root: string,
  entry: FileEntry
): Promise<string> {
  const resolved = await resolveEidosFileAttachment(
    root,
    "records.eidos",
    entry,
    "download"
  )
  assert(resolved.kind === "local", "Synthetic attachment must resolve locally")
  return digest(await fs.readFile(resolved.absolutePath))
}

async function stagingCredentials(
  tokenPath?: string,
  accountStatePath?: string
) {
  assert(
    resolveEidosLiteServiceEnvironment(
      runtimeEnvironmentOverride(
        app.isPackaged,
        process.env.EIDOS_LITE_ENVIRONMENT
      )
    ).name === "staging",
    "Staging encrypted smoke requires a staging build"
  )
  const credentialPath = tokenPath ?? accountStatePath
  assert(credentialPath, "Staging credentials are required")
  assertPrivateStagingPath(credentialPath, "file")
  const stored = tokenPath
    ? null
    : await new SecureAccountCredentialStore(credentialPath, {
        isAvailable: () => safeStorage.isEncryptionAvailable(),
        encrypt: (value) => safeStorage.encryptString(value),
        decrypt: (value) => safeStorage.decryptString(value),
      }).read()
  const token = tokenPath
    ? (await fs.readFile(tokenPath, "utf8")).trim()
    : stored?.tokens.accessToken
  assert(token, "Staging account has no access token")
  const environment = EIDOS_LITE_SERVICE_ENVIRONMENTS.staging
  const fetchStaging: typeof fetch = (input, init) =>
    net.fetch(input instanceof URL ? input.href : input, init)
  const userinfo = await fetchStaging(
    environment.accountOrigin + "/api/sync/userinfo",
    { headers: { Authorization: `Bearer ${token}` }, redirect: "error" }
  )
  assert(userinfo.ok, "Staging account authentication failed")
  const principal = (await userinfo.json()) as { sub?: string; id?: string }
  const subject = principal.sub ?? principal.id
  assert(subject, "Staging account has no subject")
  const remote = new OfficialSyncClient(environment, fetchStaging)
  return { token, environment, subject, remote }
}

export async function runEncryptedStagingSmoke(
  reportPath: string,
  tokenPath?: string,
  accountStatePath?: string
): Promise<void> {
  const { token, environment, subject, remote } = await stagingCredentials(
    tokenPath,
    accountStatePath
  )
  const repositoryName = `lite-e2ee-${randomUUID()}`
  const provisioned = await remote.provisionRepository(
    repositoryName,
    "Lite encrypted staging validation",
    token,
    true
  )
  assert(
    provisioned.encryption,
    "Staging did not provision an encrypted identity"
  )
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-encrypted-fixture-"))
  )
  const source = path.join(root, "source")
  const restored = path.join(root, "restored")
  await fs.mkdir(source, { mode: 0o700 })
  await assertSpaceRepositoryBoundary(source)
  const password = randomBytes(32).toString("hex")
  const secret = Buffer.from(password)
  const connection = (
    device: "device-a" | "device-b"
  ): GraftEncryptedInput => ({
    connection: {
      url: provisioned.remoteUrl,
      uuid: provisioned.encryption!.uuid,
      authenticationDomain: environment.accountOrigin,
      accountSubject: subject,
      bearerToken: token,
      stateDirectory: path.join(root, device, "encrypted-sync"),
    },
    password: Buffer.from(secret),
  })
  const worker = fileURLToPath(new URL("./graft-worker.js", import.meta.url))
  const runtimeWorker = fileURLToPath(
    new URL("./runtime-worker.js", import.meta.url)
  )
  const createGraft = () =>
    new GraftClient({
      syncRemoteOrigin: environment.syncRemoteOrigin,
      sdkTransport: new GraftUtilityTransport(worker),
    })
  const data = path.join(source, "records.eidos")
  const created = await cli<{ file: { revision: string } }>([
    "file",
    "new",
    data,
    "--table",
    "Records",
    "--label-field",
    "Title",
    "--fields",
    JSON.stringify([
      { name: "Title", type: "text" },
      { name: "Attachment", type: "file" },
    ]),
  ])
  const inserted = await cli<{
    revision: string
    affectedRows: { rowId: string }[]
  }>([
    "data",
    "mutate",
    data,
    "--table",
    "Records",
    "--insert",
    JSON.stringify([{ Title: "encrypted SQLite and attachment restoration" }]),
    "--expected-revision",
    created.file.revision,
  ])
  const small = path.join(root, "small-附件.bin")
  const large = path.join(root, "large.bin")
  await fs.writeFile(small, randomBytes(256 * 1024))
  await fs.writeFile(large, randomBytes(32 * 1024 * 1024))
  await cli([
    "attachment",
    "import",
    data,
    "--table",
    "Records",
    "--row",
    inserted.affectedRows[0]!.rowId,
    "--field",
    "Attachment",
    "--source",
    small,
    "--source",
    large,
    "--expected-revision",
    inserted.revision,
  ])
  const original = await cli<{
    rows: { Title: string; Attachment: FileEntry[]; _id: string }[]
  }>([
    "data",
    "query",
    data,
    "Records",
    "--compact",
    "--fields",
    "Title,Attachment",
    "--limit",
    "10",
  ])
  let expectedRows = original.rows
  const expectedAttachments = await Promise.all(
    original.rows[0]!.Attachment.map(async (entry) => ({
      uri: entry.uri,
      size: entry.size,
      sha256: await attachmentDigest(source, entry),
    }))
  )
  let session: SpaceSession | null = null
  let sdkVersion: string | undefined
  const checks: string[] = []
  try {
    const graft = createGraft()
    session = await SpaceSession.create(source, path.join(root, "device-a"), {
      graft,
      workerPath: runtimeWorker,
    })
    await session.enableVersioning()
    sdkVersion = await graft.version()
    const preflight = await session.syncPreflight()
    assert(
      preflight.blockerCount === 0,
      "Synthetic fixture failed Sync preflight"
    )
    await session.enableHostedSync(
      provisioned.remoteUrl,
      token,
      { manifestId: preflight.manifestId },
      undefined,
      connection("device-a")
    )
    checks.push(
      "source SpaceSession independently confirmed initial encrypted publication"
    )
    await session.close()
    session = null
    const current = await cli<{ revision: string }>(["file", "inspect", data])
    const revision =
      (current as { file?: { revision: string } }).file?.revision ??
      current.revision
    await cli([
      "data",
      "mutate",
      data,
      "--table",
      "Records",
      "--insert",
      JSON.stringify([{ Title: "later encrypted checkpoint" }]),
      "--expected-revision",
      revision,
    ])
    expectedRows = (
      await cli<typeof original>([
        "data",
        "query",
        data,
        "Records",
        "--compact",
        "--fields",
        "Title,Attachment",
        "--limit",
        "10",
      ])
    ).rows
    session = await SpaceSession.create(source, path.join(root, "device-a"), {
      graft: createGraft(),
      workerPath: runtimeWorker,
    })
    await session.unlockEncryptedSync(connection("device-a"))
    await session.createCheckpoint("Later encrypted checkpoint")
    const laterUpload = await session.syncHostedRemote(
      token,
      "read_write",
      undefined,
      undefined,
      "push"
    )
    assert(laterUpload.pushed, "Later checkpoint was not uploaded")
    checks.push(
      "normal checkpoint push preserved encrypted transport after session restart"
    )
    await session.close()
    session = null
    checks.push("source utility process closed before second-device enrollment")
    const coordinator = new SpaceCloneCoordinator({
      stateDirectory: path.join(root, "device-b"),
      remoteOrigin: environment.syncRemoteOrigin,
      createGraftClient: createGraft,
      validateWorktree: async (target) => {
        const runtime = new RuntimePool(target, runtimeWorker)
        try {
          await runtime.validatePaths(["records.eidos"])
        } finally {
          await runtime.destroy()
        }
      },
    })
    const wrong = connection("device-b")
    wrong.password.fill(0x78)
    let wrongPasswordRejected = false
    try {
      await coordinator.clone(
        restored,
        provisioned.remoteUrl,
        token,
        undefined,
        undefined,
        wrong
      )
    } catch {
      wrongPasswordRejected = true
    }
    wrong.password.fill(0)
    assert(wrongPasswordRejected, "Wrong password was accepted")
    assert(
      !(await fs.stat(restored).then(
        () => true,
        () => false
      )),
      "Failed clone exposed a destination"
    )
    checks.push(
      "wrong password rejected without publishing a local destination"
    )
    let cancellation: Promise<void> | undefined
    const cancelledCoordinator = new SpaceCloneCoordinator({
      stateDirectory: path.join(root, "device-b"),
      remoteOrigin: environment.syncRemoteOrigin,
      createGraftClient: createGraft,
      validateWorktree: async (target) => {
        const runtime = new RuntimePool(target, runtimeWorker)
        try {
          await runtime.validatePaths(["records.eidos"])
        } finally {
          await runtime.destroy()
        }
        // Cancel after a real encrypted transfer and validation, at the last
        // admission boundary before the downloaded folder becomes visible.
        cancellation = cancelledCoordinator.cancelEncryptedClones()
      },
    })
    const interruptedDevice = connection("device-b")
    let cancelledCloneRejected = false
    try {
      await cancelledCoordinator.clone(
        restored,
        provisioned.remoteUrl,
        token,
        undefined,
        undefined,
        interruptedDevice
      )
    } catch (error) {
      cancelledCloneRejected =
        error instanceof Error && error.name === "AbortError"
    } finally {
      interruptedDevice.password.fill(0)
    }
    await cancellation
    assert(cancellation, "Real clone did not reach its cancellation boundary")
    assert(cancelledCloneRejected, "Cancelled encrypted clone was accepted")
    assert(
      !(await fs.stat(restored).then(
        () => true,
        () => false
      )),
      "Cancelled clone exposed a destination"
    )
    assert(
      !(await fs.readdir(root)).some((name) =>
        name.startsWith(".restored.eidos-lite-clone-")
      ),
      "Cancelled clone retained its temporary worktree"
    )
    checks.push(
      "cancellation after a real encrypted transfer drained the native client and removed the unpublished worktree"
    )
    const secondDevice = connection("device-b")
    await coordinator.clone(
      restored,
      provisioned.remoteUrl,
      token,
      undefined,
      undefined,
      secondDevice
    )
    secondDevice.password.fill(0)
    checks.push(
      "the same destination accepted a fresh encrypted clone after cancellation"
    )
    const recovered = await cli<typeof original>([
      "data",
      "query",
      path.join(restored, "records.eidos"),
      "Records",
      "--compact",
      "--fields",
      "Title,Attachment",
      "--limit",
      "10",
    ])
    assert(
      JSON.stringify(recovered.rows) === JSON.stringify(expectedRows),
      "Restored SQLite rows or attachment references differ"
    )
    for (const entry of recovered.rows[0]!.Attachment)
      assert(
        (await attachmentDigest(restored, entry)) ===
          expectedAttachments.find((attachment) => attachment.uri === entry.uri)
            ?.sha256,
        "Restored attachment bytes differ"
      )
    checks.push(
      "fresh second-device utility process restored SQLite rows and File entries"
    )
    checks.push(
      "256 KiB and 32 MiB attachments matched their independent SHA-256 digests"
    )
    session = await SpaceSession.create(restored, path.join(root, "device-b"), {
      graft: createGraft(),
      workerPath: runtimeWorker,
    })
    assert(
      (await session.encryptedSyncStatus())?.state === "locked",
      "New application session loaded a key implicitly"
    )
    let lockedFailure: unknown
    try {
      await session.syncHostedRemote(token, "read_write")
    } catch (error) {
      lockedFailure = error
    }
    assert(
      classifySyncFailure(lockedFailure).code === "encryption-locked",
      "Locked Sync did not fail closed"
    )
    await session.unlockEncryptedSync(connection("device-b"))
    await session.syncHostedRemote(token, "read_write")
    await session.close()
    session = null
    const restoredData = path.join(restored, "records.eidos")
    const restoredInspection = await cli<{
      file?: { revision: string }
      revision: string
    }>(["file", "inspect", restoredData])
    await cli([
      "data",
      "mutate",
      restoredData,
      "--table",
      "Records",
      "--insert",
      JSON.stringify([{ Title: "checkpoint returned from device B" }]),
      "--expected-revision",
      restoredInspection.file?.revision ?? restoredInspection.revision,
    ])
    expectedRows = (
      await cli<typeof original>([
        "data",
        "query",
        restoredData,
        "Records",
        "--compact",
        "--fields",
        "Title,Attachment",
        "--limit",
        "10",
      ])
    ).rows
    session = await SpaceSession.create(restored, path.join(root, "device-b"), {
      graft: createGraft(),
      workerPath: runtimeWorker,
    })
    await session.unlockEncryptedSync(connection("device-b"))
    await session.createCheckpoint("Return checkpoint from device B")
    assert(
      (
        await session.syncHostedRemote(
          token,
          "read_write",
          undefined,
          undefined,
          "push"
        )
      ).pushed,
      "Second device did not upload its encrypted checkpoint"
    )
    await session.close()
    session = null
    session = await SpaceSession.create(source, path.join(root, "device-a"), {
      graft: createGraft(),
      workerPath: runtimeWorker,
    })
    await session.unlockEncryptedSync(connection("device-a"))
    assert(
      (
        await session.syncHostedRemote(
          token,
          "read_write",
          undefined,
          undefined,
          "pull"
        )
      ).pulled,
      "Original device did not pull the returned encrypted checkpoint"
    )
    const returned = await cli<typeof original>([
      "data",
      "query",
      data,
      "Records",
      "--compact",
      "--fields",
      "Title,Attachment",
      "--limit",
      "10",
    ])
    assert(
      JSON.stringify(returned.rows) === JSON.stringify(expectedRows),
      "Returned SQLite rows or File entries differ on the original device"
    )
    for (const entry of returned.rows[0]!.Attachment)
      assert(
        (await attachmentDigest(source, entry)) ===
          expectedAttachments.find((attachment) => attachment.uri === entry.uri)
            ?.sha256,
        "Incremental pull changed attachment bytes"
      )
    checks.push(
      "second device uploaded a new checkpoint and the original device pulled identical SQLite rows and attachment hashes"
    )
    await session.close()
    session = null
    session = await SpaceSession.create(restored, path.join(root, "device-b"), {
      graft: createGraft(),
      workerPath: runtimeWorker,
    })
    await session.unlockEncryptedSync(connection("device-b"))
    await session.lockEncryptedSync()
    assert(
      (await session.encryptedSyncStatus())?.state === "locked",
      "Explicit lock did not drain the native session"
    )
    checks.push(
      "restart required password; explicit unlock resumed Sync; explicit lock drained it"
    )
    await session.clearHostedSyncCredentials()
    assert(
      (await session.encryptedSyncStatus())?.state === "locked",
      "Sign-out credential clearing retained an unlocked authority"
    )
    await cli([
      "data",
      "query",
      path.join(restored, "records.eidos"),
      "Records",
      "--compact",
      "--fields",
      "Title",
      "--limit",
      "10",
    ])
    checks.push(
      "credential clearing disconnected encrypted Sync while local SQLite stayed readable"
    )
    const rememberDevice =
      process.env.EIDOS_LITE_STAGING_REMEMBER_UNLOCK === "1"
    if (rememberDevice) {
      const unlocks = createRememberedSyncUnlocks(
        {
          accountSubject: async () => subject,
          repositories: () => remote.listRepositories(token),
        },
        environment,
        { stateDirectory: path.join(root, "device-b/encrypted-sync") }
      )
      assert(
        unlocks.available(),
        "Real system secure storage is unavailable; remembering cannot be validated"
      )
      await unlocks.setDefaultPassword(secret)
      assert(
        (await unlocks.defaultStatus()).configured,
        "Default sync password was not saved"
      )
      const defaultPassword = await unlocks.readDefaultPassword()
      assert(
        defaultPassword?.equals(secret),
        "Default sync password binding changed"
      )
      defaultPassword?.fill(0)
      await session.unlockEncryptedSync(connection("device-b"))
      await unlocks.finishManual(
        session,
        provisioned.remoteUrl,
        secret,
        true,
        unlocks.captureGeneration()
      )
      assert(
        (await unlocks.status(session, provisioned.remoteUrl))?.remembered,
        "Remember choice did not persist"
      )
      const directory = path.join(
        app.getPath("userData"),
        "remembered-sync/staging"
      )
      for (const file of await fs.readdir(directory)) {
        const bytes = await fs.readFile(path.join(directory, file))
        assert(
          !bytes.includes(secret) &&
            !bytes.includes(Buffer.from(secret.toString("base64"))),
          "Remembered unlock contains plaintext credential bytes"
        )
      }
      checks.push(
        "explicit remember choice persisted only system-protected credential ciphertext"
      )
      checks.push(
        "account default password saved once with system protection; per-Space unlock enrollment remains separate"
      )
    }
    const log = await fs.readFile(
      path.join(app.getPath("logs"), "eidos-lite.jsonl"),
      "utf8"
    )
    assert(
      !log.includes(password) && !log.includes(token),
      "A secret appeared in application logs"
    )
    checks.push("application logs excluded the sync password and account token")
    await fs.writeFile(
      reportPath,
      JSON.stringify(
        {
          status: "passed",
          environment: "staging",
          packaged: app.isPackaged,
          appVersion: app.getVersion(),
          executable: process.execPath,
          fixtureCli: fixtureCli(),
          sdkVersion,
          processId: process.pid,
          repository: repositoryName,
          remoteUrl: provisioned.remoteUrl,
          encryption: provisioned.encryption,
          fixtureRoot: root,
          sqlite: {
            table: "Records",
            rows: expectedRows.length,
            rowContentSha256: digest(Buffer.from(JSON.stringify(expectedRows))),
          },
          checks,
          attachments: expectedAttachments,
          deviceIsolation:
            "separate Electron utility processes and host-private directories; same physical Mac",
          keyStorage: rememberDevice
            ? "OS-protected per-Space unlock credential; native root keys remain session-only"
            : "session-only",
        },
        null,
        2
      ) + "\n",
      { mode: 0o600 }
    )
  } finally {
    secret.fill(0)
    await session?.close()
  }
}

/** Prepare isolated, authenticated profiles; all Sync actions still use the UI. */
export async function prepareStagingUiProfiles(
  reportPath: string,
  accountStatePath: string
): Promise<void> {
  // Renew through the ordinary account service before copying access-only
  // sessions, so a rotating refresh token remains owned by the original profile.
  const originalUserData = app.getPath("userData")
  try {
    app.setPath(
      "userData",
      path.dirname(path.dirname(path.dirname(accountStatePath)))
    )
    await createSyncControlPlane(
      EIDOS_LITE_SERVICE_ENVIRONMENTS.staging
    ).accountAccessToken()
  } finally {
    app.setPath("userData", originalUserData)
  }
  const { environment, subject } = await stagingCredentials(
    undefined,
    accountStatePath
  )
  assert(
    process.env.VITE_DEV_SERVER_URL,
    "UI fixtures require the Vite development host"
  )
  const encryption = {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value: string) => safeStorage.encryptString(value),
    decrypt: (value: Buffer) => safeStorage.decryptString(value),
  }
  const original = await new SecureAccountCredentialStore(
    accountStatePath,
    encryption
  ).read()
  assert(original, "Staging account session is missing")
  const expiresAt =
    original.tokens.storedAtMs + (original.tokens.expiresIn ?? 0) * 1000
  assert(
    expiresAt > Date.now() + 30 * 60_000,
    "Staging access token needs renewal before isolated UI tests"
  )
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-ui-e2ee-"))
  )
  const password = Buffer.from(randomBytes(32).toString("hex"))
  const profiles: Record<string, string> = {}
  try {
    for (const device of ["a", "b"]) {
      const directory = path.join(root, `client-${device}`)
      await fs.mkdir(directory, { mode: 0o700 })
      const { accessToken, tokenType, storedAtMs, expiresIn } = original.tokens
      await new SecureAccountCredentialStore(
        path.join(directory, "accounts", environment.name, "oauth-session.bin"),
        encryption
      ).write({
        ...original,
        tokens: { accessToken, tokenType, storedAtMs, expiresIn },
      })
      await new RememberedSyncUnlockStore(
        path.join(directory, "remembered-sync", environment.name),
        encryption
      ).write(
        {
          domain: environment.accountOrigin,
          account: subject,
          kind: "default-password",
        },
        password
      )
      profiles[device] = directory
    }
  } finally {
    password.fill(0)
  }
  const source = path.join(root, "Functional E2EE")
  await fs.mkdir(source, { mode: 0o700 })
  await assertSpaceRepositoryBoundary(source)
  await cli([
    "file",
    "new",
    path.join(source, "records.eidos"),
    "--table",
    "Records",
    "--label-field",
    "Title",
    "--fields",
    JSON.stringify([{ name: "Title", type: "text" }]),
  ])
  await fs.writeFile(
    path.join(source, "notes.md"),
    "# Functional E2EE\n\nInitial content on client A.\n"
  )
  await fs.writeFile(
    path.join(source, ".hidden-ordinary.txt"),
    "Hidden files must sync without confirmation.\n"
  )
  await fs.writeFile(
    path.join(source, "secret-garden.txt"),
    "File names must not trigger confirmation.\n"
  )
  await fs.writeFile(path.join(source, "binary.bin"), randomBytes(512 * 1024))
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        status: "prepared",
        root,
        source,
        profiles,
        expiresAt,
        limitations: [
          "Two profiles on one Mac share the existing account device registration",
          "Test-only sync password is preconfigured in OS secure storage; UI password creation is not covered",
          "Access tokens are copied without refresh tokens; renewal uses the original profile's ordinary account service",
        ],
      },
      null,
      2
    ),
    { mode: 0o600 }
  )
}

export async function runRememberedStagingRestore(
  reportPath: string,
  enrollmentPath: string,
  tokenPath?: string,
  accountStatePath?: string
): Promise<void> {
  const { token, environment, subject, remote } = await stagingCredentials(
    tokenPath,
    accountStatePath
  )
  assertPrivateStagingPath(enrollmentPath, "file")
  const enrollment = JSON.parse(await fs.readFile(enrollmentPath, "utf8")) as {
    status: string
    fixtureRoot: string
    remoteUrl: string
    processId: number
    sqlite: { rowContentSha256: string }
    attachments: { uri: string; sha256: string }[]
  }
  assert(
    enrollment.status === "passed" && path.isAbsolute(enrollment.fixtureRoot),
    "Valid enrollment evidence is required"
  )
  assert(
    enrollment.processId !== process.pid,
    "Remembered unlock must be tested in a new Electron application process"
  )
  const restored = path.join(enrollment.fixtureRoot, "restored")
  await assertSpaceRepositoryBoundary(restored)
  const worker = fileURLToPath(new URL("./graft-worker.js", import.meta.url))
  const runtimeWorker = fileURLToPath(
    new URL("./runtime-worker.js", import.meta.url)
  )
  const graft = new GraftClient({
    syncRemoteOrigin: environment.syncRemoteOrigin,
    sdkTransport: new GraftUtilityTransport(worker),
  })
  const session = await SpaceSession.create(
    restored,
    path.join(enrollment.fixtureRoot, "device-b"),
    {
      graft,
      workerPath: runtimeWorker,
    }
  )
  try {
    const unlocks = createRememberedSyncUnlocks(
      {
        accountSubject: async () => subject,
        repositories: () => remote.listRepositories(token),
      },
      environment,
      {
        stateDirectory: path.join(
          enrollment.fixtureRoot,
          "device-b/encrypted-sync"
        ),
      }
    )
    assert(unlocks.available(), "Real system secure storage is unavailable")
    assert(
      (await unlocks.defaultStatus()).configured,
      "Default sync password did not survive application restart"
    )
    assert(
      (await session.encryptedSyncStatus())?.state === "locked",
      "New utility process unexpectedly retained a native key"
    )
    const readingSession = session
    const concurrentReads: Promise<void>[] = []
    const readFailures: unknown[] = []
    const poll = setInterval(() => {
      concurrentReads.push(
        Promise.all([
          readingSession.hasEncryptedSync(),
          readingSession.encryptedSyncStatus(),
          readingSession.officialSyncRemoteUrl(),
        ]).then(
          () => undefined,
          (error) => {
            readFailures.push(error)
          }
        )
      )
    }, 50)
    try {
      await unlocks.autoUnlock(session, enrollment.remoteUrl, token)
    } finally {
      clearInterval(poll)
      await Promise.all(concurrentReads)
    }
    assert(
      concurrentReads.length > 0,
      "Restart did not exercise concurrent status reads"
    )
    assert(
      readFailures.length === 0,
      "A concurrent status read observed an unavailable repository during unlock"
    )
    assert(
      (await session.encryptedSyncStatus())?.state === "unlocked",
      "System-protected credential did not automatically unlock after application restart"
    )
    await session.syncHostedRemote(token, "read_write")
    const recovered = await cli<{ rows: { Attachment: FileEntry[] }[] }>([
      "data",
      "query",
      path.join(restored, "records.eidos"),
      "Records",
      "--compact",
      "--fields",
      "Title,Attachment",
      "--limit",
      "10",
    ])
    const sdkVersion = await graft.version()
    assert(
      digest(Buffer.from(JSON.stringify(recovered.rows))) ===
        enrollment.sqlite.rowContentSha256,
      "SQLite rows changed after remembered restart"
    )
    for (const entry of recovered.rows[0]!.Attachment)
      assert(
        (await attachmentDigest(restored, entry)) ===
          enrollment.attachments.find(
            (attachment) => attachment.uri === entry.uri
          )?.sha256,
        "Remembered restart changed attachment bytes"
      )
    unlocks.blockAutomatic()
    await session.lockEncryptedSync()
    await unlocks.autoUnlock(session, enrollment.remoteUrl, token)
    assert(
      (await session.encryptedSyncStatus())?.state === "locked",
      "Explicit lock was bypassed by automatic credential reload"
    )
    unlocks.reconnect()
    await unlocks.autoUnlock(session, enrollment.remoteUrl, token)
    assert(
      (await session.encryptedSyncStatus())?.state === "unlocked",
      "Explicit reconnect did not re-enable remembered unlock"
    )
    await unlocks.forget(session, enrollment.remoteUrl)
    const restartedHost = createRememberedSyncUnlocks(
      {
        accountSubject: async () => subject,
        repositories: () => remote.listRepositories(token),
      },
      environment,
      {
        stateDirectory: path.join(
          enrollment.fixtureRoot,
          "device-b/encrypted-sync"
        ),
      }
    )
    await restartedHost.autoUnlock(session, enrollment.remoteUrl, token)
    assert(
      (await session.encryptedSyncStatus())?.state === "locked",
      "Forgotten credential was loaded again"
    )
    assert(
      !(await restartedHost.status(session, enrollment.remoteUrl))?.remembered,
      "Remembered entry survived forget"
    )
    assert(
      (await restartedHost.defaultStatus()).configured,
      "Forgetting one Space removed the account default"
    )
    await restartedHost.forgetDefaultPassword()
    assert(
      !(await restartedHost.defaultStatus()).configured,
      "Default removal did not persist"
    )
    const log = await fs.readFile(
      path.join(app.getPath("logs"), "eidos-lite.jsonl"),
      "utf8"
    )
    assert(!log.includes(token), "Account token appeared in logs")
    await fs.writeFile(
      reportPath,
      JSON.stringify(
        {
          status: "passed",
          environment: "staging",
          packaged: app.isPackaged,
          appVersion: app.getVersion(),
          executable: process.execPath,
          fixtureCli: fixtureCli(),
          sdkVersion,
          processId: process.pid,
          enrollmentProcessId: enrollment.processId,
          enrollmentReport: enrollmentPath,
          fixtureRoot: enrollment.fixtureRoot,
          remoteUrl: enrollment.remoteUrl,
          sqlite: enrollment.sqlite,
          attachments: enrollment.attachments,
          checks: [
            "concurrent metadata and status reads waited for automatic unlock session replacement without observing a closed repository",
            "fresh Electron application and utility process automatically unlocked without a supplied sync password",
            "real macOS safeStorage protected the remembered credential on disk",
            "SQLite rows and both attachment hashes survived the restart",
            "explicit lock blocked automatic provider reload until explicit reconnect",
            "forget drained the native session and removed this Space's remembered entry",
            "a newly constructed host could not reload the forgotten credential",
            "account token excluded from application logs",
          ],
          keyStorage:
            "OS-protected per-Space unlock credential; native root keys remain session-only",
          deviceIsolation:
            "two actual Electron application launches on the same physical Mac",
        },
        null,
        2
      ) + "\n",
      { mode: 0o600 }
    )
  } finally {
    await session.close()
  }
}
