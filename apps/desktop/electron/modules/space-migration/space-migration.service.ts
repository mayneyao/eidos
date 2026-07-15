import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { IpcMethod, IpcServiceBase } from "@eidos.space/electron-ipc"
import {
  assessLegacyExtensionPortability,
  planLegacySpaceMigration,
  sanitizePathSegment,
  type LegacyExtensionPortabilityAssessment,
} from "@eidos.space/legacy-space-migration"
import {
  exportLegacyExtensionArchive,
  exportLegacySpace,
  inspectLegacyExtensions,
  inspectLegacySpace,
} from "@eidos.space/legacy-space-migration/better-sqlite3"
import type {
  LegacySpaceMigrationPlan,
  LegacySpaceMigrationResult,
} from "@eidos.space/legacy-space-migration"

import { IpcInjectable, Inject } from "../../common/di"
import { MainWindowProvider } from "../space-management/main-window.provider"
import { SpaceRegistry } from "../space-management/space-registry"

export interface SpaceMigrationPlanHandle {
  id: string
  spaceId: string
  spaceName: string
  plan: LegacySpaceMigrationPlan
}

export interface LegacyExtensionExportItem {
  id: string
  slug: string | null
  name: string | null
  description: string | null
  type: string | null
  version: string | null
  previouslyEnabled: boolean
  portability: LegacyExtensionPortabilityAssessment
}

interface StoredPlan extends SpaceMigrationPlanHandle {
  createdAt: number
  running: boolean
}

const PLAN_TTL_MS = 30 * 60 * 1000

@IpcInjectable("space-migration", { exposeMode: "decorated" })
export class SpaceMigrationService extends IpcServiceBase {
  private readonly plans = new Map<string, StoredPlan>()

  constructor(
    @Inject(SpaceRegistry) private readonly registry: SpaceRegistry,
    @Inject(MainWindowProvider)
    private readonly windowProvider: MainWindowProvider
  ) {
    super()
  }

  @IpcMethod()
  listLegacyExtensions(spaceId: string): LegacyExtensionExportItem[] {
    const space = this.requireLegacySpace(spaceId)
    return inspectLegacyExtensions(space.path).map((extension) => ({
      id: extension.id,
      slug: extension.slug,
      name: extension.name,
      description: extension.description,
      type: extension.type,
      version: extension.version,
      previouslyEnabled: extension.enabled,
      portability: assessLegacyExtensionPortability(extension),
    }))
  }

  @IpcMethod()
  async exportLegacyExtension(
    spaceId: string,
    extensionId: string,
    destinationRoot: string
  ) {
    const space = this.requireLegacySpace(spaceId)
    const extension = inspectLegacyExtensions(space.path).find(
      (candidate) => candidate.id === extensionId
    )
    if (!extension)
      throw new Error(`Legacy extension not found: ${extensionId}`)
    const resolvedDestination = path.resolve(destinationRoot)
    if (
      !fs.existsSync(resolvedDestination) ||
      !fs.statSync(resolvedDestination).isDirectory()
    ) {
      throw new Error(`Extension archive destination is not a folder`)
    }
    const realDestination = fs.realpathSync.native(resolvedDestination)
    const targetDirectory = path.join(
      realDestination,
      sanitizePathSegment(
        extension.slug ?? extension.name ?? extension.id,
        extension.id
      )
    )
    if (this.isRuntimeExtensionPath(targetDirectory)) {
      throw new Error(
        "Legacy source archives cannot be exported under .eidos/extensions"
      )
    }
    if (
      this.pathsOverlap(fs.realpathSync.native(space.path), targetDirectory)
    ) {
      throw new Error(
        "Legacy extension archives must be exported outside the source Space"
      )
    }
    return exportLegacyExtensionArchive(extension, { targetDirectory })
  }

  @IpcMethod()
  createPlan(spaceId: string, targetRoot: string): SpaceMigrationPlanHandle {
    this.prunePlans()
    const space = this.requireLegacySpace(spaceId)
    const resolvedTarget = path.resolve(targetRoot)
    this.assertTargetAvailable(resolvedTarget)
    const conflict = this.registry.getSpacePathConflict(resolvedTarget)
    if (conflict) {
      throw new Error(
        `Migration target conflicts with registered Space ${conflict.space.name}`
      )
    }
    const snapshot = inspectLegacySpace(space.path)
    const plan = planLegacySpaceMigration(snapshot, {
      targetRoot: resolvedTarget,
    })
    const stored: StoredPlan = {
      id: randomUUID(),
      spaceId,
      spaceName: space.name,
      plan,
      createdAt: Date.now(),
      running: false,
    }
    this.plans.set(stored.id, stored)
    return this.publicHandle(stored)
  }

  @IpcMethod()
  async executePlan(planId: string): Promise<LegacySpaceMigrationResult> {
    const stored = this.plans.get(planId)
    if (!stored || stored.createdAt < Date.now() - PLAN_TTL_MS) {
      this.plans.delete(planId)
      throw new Error("Migration plan expired; preview the Space again")
    }
    if (stored.running) throw new Error("Migration export is already running")
    stored.running = true
    try {
      return await exportLegacySpace(stored.plan, {
        onProgress: (progress) => {
          this.windowProvider
            .getWindow()
            ?.webContents.send("space-migration:progress", {
              planId,
              ...progress,
            })
        },
      })
    } finally {
      this.plans.delete(planId)
    }
  }

  @IpcMethod()
  discardPlan(planId: string): boolean {
    const stored = this.plans.get(planId)
    if (!stored || stored.running) return false
    return this.plans.delete(planId)
  }

  private publicHandle(stored: StoredPlan): SpaceMigrationPlanHandle {
    return {
      id: stored.id,
      spaceId: stored.spaceId,
      spaceName: stored.spaceName,
      plan: stored.plan,
    }
  }

  private requireLegacySpace(spaceId: string) {
    const space = this.registry.getSpace(spaceId)
    if (!space) throw new Error(`Space not found: ${spaceId}`)
    if (space.mode !== "legacy") {
      throw new Error("Only legacy database Spaces can be exported")
    }
    return space
  }

  private pathsOverlap(left: string, right: string): boolean {
    const contains = (parent: string, candidate: string) => {
      const relative = path.relative(parent, candidate)
      return (
        relative === "" ||
        (relative !== ".." &&
          !relative.startsWith(`..${path.sep}`) &&
          !path.isAbsolute(relative))
      )
    }
    return contains(left, right) || contains(right, left)
  }

  private isRuntimeExtensionPath(candidate: string): boolean {
    const segments = path
      .resolve(candidate)
      .split(path.sep)
      .map((segment) => segment.toLocaleLowerCase("en-US"))
    return segments.some(
      (segment, index) =>
        segment === ".eidos" && segments[index + 1] === "extensions"
    )
  }

  private prunePlans(): void {
    const oldestAllowed = Date.now() - PLAN_TTL_MS
    for (const [planId, plan] of this.plans) {
      if (!plan.running && plan.createdAt < oldestAllowed) {
        this.plans.delete(planId)
      }
    }
  }

  private assertTargetAvailable(targetRoot: string): void {
    if (!fs.existsSync(targetRoot)) return
    const stats = fs.statSync(targetRoot)
    if (!stats.isDirectory()) {
      throw new Error(`Migration target is not a folder: ${targetRoot}`)
    }
    if (fs.readdirSync(targetRoot).length > 0) {
      throw new Error(`Migration target must be empty: ${targetRoot}`)
    }
  }
}
