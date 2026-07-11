import { execFile, type ExecFileOptionsWithStringEncoding } from "child_process"

import { Injectable } from "../../common/di"
import { getResourcePath } from "../../utils/resources"

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_BUFFER_BYTES = 16 * 1024 * 1024
const MAX_ERROR_OUTPUT_LENGTH = 2_000

export interface GraftCliRunOptions {
  timeoutMs?: number
  maxBufferBytes?: number
}

export class GraftCliError extends Error {
  readonly command: string
  readonly exitCode: number | null

  constructor(
    message: string,
    command: string,
    exitCode: number | null = null
  ) {
    super(message)
    this.name = "GraftCliError"
    this.command = command
    this.exitCode = exitCode
  }
}

function graftBinaryPath(): string {
  return getResourcePath(
    process.platform === "win32" ? "dist-cli/graft.exe" : "dist-cli/graft"
  )
}

function errorOutput(stderr: string, fallback: string): string {
  const output = stderr.trim() || fallback.trim()
  if (!output) {
    return "Graft command failed"
  }
  return output.slice(0, MAX_ERROR_OUTPUT_LENGTH)
}

function parseJsonOutput(stdout: string, command: string): unknown {
  const output = stdout.trim()
  if (!output) {
    throw new GraftCliError("Graft returned an empty JSON response", command)
  }

  try {
    return JSON.parse(output) as unknown
  } catch {
    throw new GraftCliError("Graft returned malformed JSON", command)
  }
}

@Injectable()
export class GraftCliProcessRunner {
  async runJson(
    cwd: string,
    args: readonly string[],
    options: GraftCliRunOptions = {}
  ): Promise<unknown> {
    const command = args[0] ?? "unknown"
    const stdout = await new Promise<string>((resolve, reject) => {
      const execOptions: ExecFileOptionsWithStringEncoding = {
        cwd,
        encoding: "utf8",
        env: { ...process.env, NO_COLOR: "1" },
        maxBuffer: options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES,
        shell: false,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        windowsHide: true,
      }

      execFile(
        graftBinaryPath(),
        [...args],
        execOptions,
        (error, commandStdout, commandStderr) => {
          if (!error) {
            resolve(commandStdout)
            return
          }

          const exitCode = typeof error.code === "number" ? error.code : null
          const fallback =
            error.code === "ENOENT"
              ? "Bundled Graft CLI was not found"
              : error.message
          reject(
            new GraftCliError(
              errorOutput(commandStderr, fallback),
              command,
              exitCode
            )
          )
        }
      )
    })

    return parseJsonOutput(stdout, command)
  }
}
