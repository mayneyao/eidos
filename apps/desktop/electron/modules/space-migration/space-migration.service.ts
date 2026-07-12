import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { IpcServiceBase } from "@eidos.space/electron-ipc"
import { planLegacySpaceMigration } from "@eidos.space/legacy-space-migration"
import {
  exportLegacySpace,
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

interface StoredPlan extends SpaceMigrationPlanHandle {
  createdAt: number
  running: boolean
}

const PLAN_TTL_MS = 30 * 60 * 1000

@IpcInjectable("space-migration")
export class SpaceMigrationService extends IpcServiceBase {
  private readonly plans = new Map<string, StoredPlan>()

  constructor(
    @Inject(SpaceRegistry) private readonly registry: SpaceRegistry,
    @Inject(MainWindowProvider)
    private readonly windowProvider: MainWindowProvider
  ) {
    super()
  }

  createPlan(spaceId: string, targetRoot: string): SpaceMigrationPlanHandle {
    this.prunePlans()
    const space = this.registry.getSpace(spaceId)
    if (!space) throw new Error(`Space not found: ${spaceId}`)
    if (space.mode !== "legacy") {
      throw new Error("Only legacy database Spaces can be exported")
    }
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
