import { GraftClient, type GraftRunOptions } from "@eidos.space/graft-client"

import { Injectable, Inject } from "../../common/di"
import { GraftCliProcessRunner } from "./graft-cli-runner"
import { GraftSqliteExecutor } from "./graft-sqlite-executor"
import { SpaceResourceLifecycle } from "../space-management/space-resource-lifecycle"

/**
 * Runs repository operations over a repository-scoped SQLite/Graft process.
 * Repository initialization remains a one-shot CLI operation because the
 * control database does not exist until `graft init` creates it.
 */
@Injectable()
export class GraftRunner {
  private readonly client: GraftClient

  constructor(
    @Inject(GraftSqliteExecutor) executor: GraftSqliteExecutor,
    @Inject(GraftCliProcessRunner)
    private readonly processRunner: GraftCliProcessRunner,
    @Inject(SpaceResourceLifecycle)
    resourceLifecycle: SpaceResourceLifecycle
  ) {
    this.client = new GraftClient(executor)
    resourceLifecycle.register(
      "graft",
      (repositoryPath) => this.client.close(repositoryPath),
      () => this.client.close()
    )
  }

  runJson(
    repositoryPath: string,
    args: readonly string[],
    options: GraftRunOptions = {}
  ): Promise<unknown> {
    if (args[0] === "init") {
      return this.processRunner.runJson(repositoryPath, args, options)
    }
    return this.client.runJson(repositoryPath, args, options)
  }

  close(repositoryPath?: string): Promise<void> | void {
    return this.client.close(repositoryPath)
  }
}
