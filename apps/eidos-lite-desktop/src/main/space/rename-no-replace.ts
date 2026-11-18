import path from "node:path"
import { getSystemErrorName } from "node:util"

type Rename = (source: string, target: string) => Promise<void>
type NativeCallback = (error: Error | null, result: number) => void

const RENAME_EXCL = 0x4
const AT_FDCWD = -100
const RENAME_NOREPLACE = 1

const windowsErrorCodes = new Map([
  [2, "ENOENT"], // ERROR_FILE_NOT_FOUND
  [3, "ENOENT"], // ERROR_PATH_NOT_FOUND
  [5, "EACCES"], // ERROR_ACCESS_DENIED
  [17, "EXDEV"], // ERROR_NOT_SAME_DEVICE
  [32, "EBUSY"], // ERROR_SHARING_VIOLATION
  [33, "EBUSY"], // ERROR_LOCK_VIOLATION
  [80, "EEXIST"], // ERROR_FILE_EXISTS
  [145, "ENOTEMPTY"], // ERROR_DIR_NOT_EMPTY
  [183, "EEXIST"], // ERROR_ALREADY_EXISTS
])

function nativeError(code: string) {
  return Object.assign(new Error(`Could not move file or folder (${code})`), {
    code,
  })
}

function callNative(
  start: (callback: NativeCallback) => void,
  succeeded: (result: number) => boolean,
  getErrorCode: () => string
): Promise<void> {
  return new Promise((resolve, reject) => {
    start((error, result) => {
      if (error) reject(error)
      else if (succeeded(result)) resolve()
      // The async binding exposes the syscall's error inside this callback.
      else reject(nativeError(getErrorCode()))
    })
  })
}

async function createNativeRename(): Promise<Rename> {
  const { default: koffi } = await import("koffi")
  if (process.platform === "win32") {
    const kernel = koffi.load("kernel32.dll")
    const move = kernel.func("int __stdcall MoveFileExW(str16, str16, uint32)")
    const lastError = kernel.func("uint32 __stdcall GetLastError()")
    return (source, target) =>
      callNative(
        (done) =>
          move.async(
            path.toNamespacedPath(source),
            path.toNamespacedPath(target),
            0,
            done
          ),
        (result) => result !== 0,
        () => {
          const code: number = lastError()
          return windowsErrorCodes.get(code) ?? `Windows error ${code}`
        }
      )
  }

  const getErrno = () => {
    const errno = koffi.errno()
    return errno > 0 ? getSystemErrorName(-errno) : "EIO"
  }
  const succeeded = (result: number) => result === 0
  if (process.platform === "darwin") {
    const system = koffi.load("/usr/lib/libSystem.B.dylib")
    const rename = system.func("int renamex_np(str, str, uint)")
    return (source, target) =>
      callNative(
        (done) => rename.async(source, target, RENAME_EXCL, done),
        succeeded,
        getErrno
      )
  }
  if (process.platform === "linux") {
    const libc = koffi.load("libc.so.6")
    const rename = libc.func("int renameat2(int, str, int, str, uint)")
    return (source, target) =>
      callNative(
        (done) =>
          rename.async(
            AT_FDCWD,
            source,
            AT_FDCWD,
            target,
            RENAME_NOREPLACE,
            done
          ),
        succeeded,
        getErrno
      )
  }
  throw new Error("Exclusive file moves are not supported on this platform")
}

let nativeRename: Promise<Rename> | undefined

export async function renameNoReplace(
  source: string,
  target: string
): Promise<void> {
  const rename = await (nativeRename ??= createNativeRename()).catch(
    (cause: unknown) => {
      throw new Error("Exclusive file moves are not available on this system", {
        cause,
      })
    }
  )
  await rename(source, target)
}
