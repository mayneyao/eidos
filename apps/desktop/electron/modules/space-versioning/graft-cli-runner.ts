import { Injectable } from "../../common/di"
import { getResourcePath } from "../../utils/resources"
import { GraftCliProcess, type GraftCliRunOptions } from "./graft-cli-process"

function graftBinaryPath(): string {
  return getResourcePath(
    process.platform === "win32" ? "dist-cli/graft.exe" : "dist-cli/graft"
  )
}

@Injectable()
export class GraftCliProcessRunner {
  private readonly process = new GraftCliProcess(graftBinaryPath())

  async runJson(
    cwd: string,
    args: readonly string[],
    options: GraftCliRunOptions = {}
  ): Promise<unknown> {
    return this.process.runJson(cwd, args, options)
  }
}
