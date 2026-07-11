import { GraftClient, type GraftRunOptions } from "@eidos.space/graft-client"

import { Injectable, Inject } from "../../common/di"
import { GraftCliProcessRunner } from "./graft-cli-runner"
import { GraftSqliteExecutor } from "./graft-sqlite-executor"

/**
 * Runs repository operations over one long-lived SQLite/Graft connection.
 * Repository initialization remains a one-shot CLI operation because the
 * control database does not exist until `graft init` creates it.
 */
@Injectable()
export class GraftRunner {
  private readonly client: GraftClient

  constructor(
    @Inject(GraftSqliteExecutor) executor: GraftSqliteExecutor,
    @Inject(GraftCliProcessRunner)
    private readonly processRunner: GraftCliProcessRunner
  ) {
    this.client = new GraftClient(executor)
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
}
