import {
  execFile,
  type ExecFileOptionsWithStringEncoding,
} from "node:child_process"

import { assertGraftRuntimeVersion } from "./graft-runtime-version"

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_BUFFER_BYTES = 16 * 1024 * 1024
const MAX_ERROR_OUTPUT_LENGTH = 2_000

export interface GraftCliRunOptions {
  timeoutMs?: number
  maxBufferBytes?: number
  /** Passed only to the child process through Graft's official auth mechanism. */
  remoteToken?: string
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

function errorOutput(
  stderr: string,
  fallback: string,
  secret?: string
): string {
  const output = stderr.trim() || fallback.trim()
  const redacted = secret ? output.split(secret).join("[redacted]") : output
  return (redacted || "Graft command failed").slice(0, MAX_ERROR_OUTPUT_LENGTH)
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

/**
 * Process boundary for Graft's v0.8 control plane. Repository operations are
 * sent to the bundled CLI, which invokes Graft's typed repository service;
 * this class never opens the SQLite extension or constructs repository PRAGMAs.
 */
export class GraftCliProcess {
  private versionCheck: Promise<void> | null = null

  constructor(private readonly binaryPath: string) {}

  async runJson(
    cwd: string,
    args: readonly string[],
    options: GraftCliRunOptions = {}
  ): Promise<unknown> {
    await this.requireExpectedVersion()
    const command = args[0] ?? "unknown"
    const stdout = await this.execute(cwd, args, options)
    return parseJsonOutput(stdout, command)
  }

  private execute(
    cwd: string,
    args: readonly string[],
    options: GraftCliRunOptions
  ): Promise<string> {
    const command = args[0] ?? "unknown"
    return new Promise<string>((resolve, reject) => {
      const execOptions: ExecFileOptionsWithStringEncoding = {
        cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          NO_COLOR: "1",
          ...(options.remoteToken
            ? { GRAFT_REMOTE_TOKEN: options.remoteToken }
            : {}),
        },
        maxBuffer: options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES,
        shell: false,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        windowsHide: true,
      }
      execFile(
        this.binaryPath,
        [...args],
        execOptions,
        (error, stdout, stderr) => {
          if (!error) {
            resolve(stdout)
            return
          }
          reject(
            new GraftCliError(
              errorOutput(
                stderr,
                error.code === "ENOENT"
                  ? "Bundled Graft CLI was not found"
                  : error.message,
                options.remoteToken
              ),
              command,
              typeof error.code === "number" ? error.code : null
            )
          )
        }
      )
    })
  }

  private requireExpectedVersion(): Promise<void> {
    if (this.versionCheck) return this.versionCheck
    this.versionCheck = new Promise<void>((resolve, reject) => {
      execFile(
        this.binaryPath,
        ["--version"],
        {
          encoding: "utf8",
          env: { ...process.env, NO_COLOR: "1" },
          maxBuffer: 64 * 1024,
          shell: false,
          timeout: DEFAULT_TIMEOUT_MS,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(
              new GraftCliError(
                errorOutput(stderr, error.message),
                "--version",
                typeof error.code === "number" ? error.code : null
              )
            )
            return
          }
          try {
            assertGraftRuntimeVersion(stdout, "CLI")
            resolve()
          } catch (versionError) {
            reject(versionError)
          }
        }
      )
    }).catch((error) => {
      this.versionCheck = null
      throw error
    })
    return this.versionCheck
  }
}
