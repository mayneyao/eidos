import type { DataSpace } from "@/packages/core/data-space"
import log from "electron-log"

import { Inject, Injectable, container } from "../../common/di"
import { getResourcePath } from "../../utils/resources"
import { SpaceRegistry } from "../space-management/space-registry"
import {
  actionableGraftRemoteError,
  graftRemoteHttpStatus,
  isOfficialGraftRemoteUrl,
  OfficialGraftRemoteService,
} from "../sync/official-graft-remote"
import { DataSpaceProcessPool } from "./data-space-process-pool.service"
import { RpcClient } from "./worker/rpc/rpc-client"
import type { WorkerInitData } from "./worker/rpc/rpc-types"

const REMOTE_METHODS = new Set([
  "clone",
  "convertToGraft",
  "fetch",
  "pull",
  "push",
  "reconfigureRemote",
])
const REMOTE_RPC_METHODS = new Set(
  [...REMOTE_METHODS].flatMap((method) => [method, `graft.${method}`])
)

@Injectable()
export class DataSpaceManager {
  private dataSpaceProxy: DataSpace | null = null
  private currentSpaceId: string | null = null
  private initializationPromise: Promise<DataSpace> | null = null

  constructor(
    @Inject(DataSpaceProcessPool) private processPool: DataSpaceProcessPool
  ) {}

  private get spaceRegistry(): SpaceRegistry {
    return container.get(SpaceRegistry)
  }

  private get officialRemote(): OfficialGraftRemoteService {
    return container.get(OfficialGraftRemoteService)
  }

  public getCurrentSpaceId(): string | null {
    return this.currentSpaceId
  }

  public getDataSpace(): DataSpace | null {
    return this.dataSpaceProxy
  }

  public async reload(): Promise<DataSpace | null> {
    const spaceId = this.currentSpaceId
    if (!spaceId) return null

    await this.processPool.kill(spaceId)
    this.dataSpaceProxy = null
    this.initializationPromise = null
    return this.getOrSetDataSpace(spaceId)
  }

  public async close(): Promise<boolean> {
    if (!this.currentSpaceId) return false
    this.processPool.killAll()
    this.dataSpaceProxy = null
    this.currentSpaceId = null
    return true
  }

  public async getOrSetDataSpace(
    spaceId: string,
    syncOptions?: {
      enabled: boolean
      remote?: string
      requireRemoteClone?: boolean
    }
  ): Promise<DataSpace> {
    if (this.currentSpaceId === spaceId && this.dataSpaceProxy) {
      return this.dataSpaceProxy
    }
    if (this.initializationPromise && this.currentSpaceId === spaceId) {
      return this.initializationPromise
    }

    const spaceInfo = this.spaceRegistry.getSpace(spaceId)
    if (!spaceInfo) throw new Error(`Space not found: ${spaceId}`)
    if (spaceInfo.mode === "file") {
      throw new Error(
        `File Space ${spaceId} does not have a legacy DataSpace database`
      )
    }

    this.initializationPromise = (async () => {
      log.info(`Initializing data space manager for space: ${spaceId}`)
      this.currentSpaceId = spaceId

      const remoteSyncEnabled =
        syncOptions?.enabled ?? spaceInfo.sync?.enabled ?? false
      const remote = syncOptions?.remote ?? spaceInfo.sync?.remote ?? ""
      if (remoteSyncEnabled && !isOfficialGraftRemoteUrl(remote)) {
        throw new Error(
          "This Space uses a legacy or invalid remote. Reconnect it to Eidos Sync."
        )
      }
      const remoteToken = remoteSyncEnabled
        ? await this.officialRemote.getAccessToken()
        : undefined
      const graftEnabled =
        remoteSyncEnabled || spaceInfo.versioning?.enabled || false

      const initData: WorkerInitData = {
        spaceInfo,
        paths: {
          spacePath: spaceInfo.path,
          simplePathConfig: {
            libPath: getResourcePath("dist-sqlite-ext/libsimple"),
            dictPath: getResourcePath("dist-sqlite-ext/dict"),
          },
          vecPathConfig: {
            libPath: getResourcePath("dist-sqlite-ext/libvec"),
          },
          graftPathConfig: {
            libPath: getResourcePath("dist-sqlite-ext/libgraft"),
            cliPath: getResourcePath(
              process.platform === "win32"
                ? "dist-cli/graft.exe"
                : "dist-cli/graft"
            ),
            enabled: graftEnabled,
            syncEnabled: remoteSyncEnabled,
            remote,
            remoteToken,
            requireRemoteClone: syncOptions?.requireRemoteClone,
          },
        },
      }

      let childProcess: Electron.UtilityProcess
      try {
        childProcess = await this.processPool.getProcess(spaceId, initData)
      } catch (error) {
        if (!remoteSyncEnabled || graftRemoteHttpStatus(error) !== 401) {
          throw actionableGraftRemoteError(error)
        }
        await this.processPool.kill(spaceId)
        initData.paths.graftPathConfig.remoteToken =
          await this.officialRemote.refreshAccessToken()
        try {
          childProcess = await this.processPool.getProcess(spaceId, initData)
        } catch (retryError) {
          throw actionableGraftRemoteError(retryError)
        }
      }
      const client = new RpcClient(childProcess as never)

      childProcess.on("message", (payload: any) => {
        if (payload.type !== "log") return
        const { level, message, args = [] } = payload
        const logMessage = `[${spaceId}] ${message}${args.length ? ` ${args.join(" ")}` : ""}`
        const method = level in log ? level : "log"
        ;(log[method as keyof typeof log] as (...values: unknown[]) => void)(
          logMessage
        )
      })

      const proxy = this.withAuthenticatedRemoteCalls(client.createProxy())
      this.dataSpaceProxy = proxy
      return proxy
    })().finally(() => {
      this.initializationPromise = null
    })

    return this.initializationPromise
  }

  private withAuthenticatedRemoteCalls(proxy: DataSpace): DataSpace {
    return new Proxy(proxy as object, {
      get: (target, property, receiver) => {
        const value = Reflect.get(target, property, receiver)
        if (property === "_executePayload") {
          return (
            payload: { method?: string; params?: unknown[] },
            ...rest: unknown[]
          ) => {
            if (!payload?.method || !REMOTE_RPC_METHODS.has(payload.method)) {
              return value(payload, ...rest)
            }
            this.assertOfficialRemoteArgument(payload.method, payload.params)
            return this.withOfficialToken((token) =>
              value(
                {
                  ...payload,
                  params: this.remoteRpcParams(
                    payload.method!,
                    payload.params,
                    token
                  ),
                },
                ...rest
              )
            )
          }
        }
        if (typeof property !== "string" || !REMOTE_METHODS.has(property)) {
          return value
        }
        return (...args: unknown[]) => {
          this.assertOfficialRemoteArgument(property, args)
          return this.withOfficialToken((token) => {
            if (
              property === "pull" ||
              property === "push" ||
              property === "fetch"
            ) {
              return value(token)
            }
            return value(args[0], token)
          })
        }
      },
    }) as DataSpace
  }

  private async withOfficialToken<T>(
    operation: (token: string) => T | Promise<T>
  ): Promise<T> {
    const token = await this.officialRemote.getAccessToken()
    try {
      return await operation(token)
    } catch (error) {
      if (graftRemoteHttpStatus(error) !== 401) {
        throw actionableGraftRemoteError(error)
      }
      const refreshedToken = await this.officialRemote.refreshAccessToken()
      try {
        return await operation(refreshedToken)
      } catch (retryError) {
        throw actionableGraftRemoteError(retryError)
      }
    }
  }

  private remoteRpcParams(
    method: string,
    params: unknown[] | undefined,
    token: string
  ): unknown[] {
    const operation = method.split(".").at(-1)
    if (operation === "pull" || operation === "push" || operation === "fetch") {
      return [token]
    }
    return [params?.[0], token]
  }

  private assertOfficialRemoteArgument(
    method: string,
    params: unknown[] | undefined
  ): void {
    const operation = method.split(".").at(-1)
    if (
      (operation === "clone" ||
        operation === "convertToGraft" ||
        operation === "reconfigureRemote") &&
      !isOfficialGraftRemoteUrl(params?.[0])
    ) {
      throw new Error(
        "Desktop remote operations require a provisioned Eidos Sync URL."
      )
    }
  }
}
