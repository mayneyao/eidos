import { describe, expect, it } from "vitest"
import {
  getIpcMethodNames,
  IpcMethod,
  IpcServiceBase,
} from "@eidos.space/electron-ipc"

import { IpcInjectable } from "./decorators"

describe("IpcInjectable", () => {
  it("keeps the inherited register method out of all-mode IPC discovery", () => {
    @IpcInjectable("test-all")
    class AllModeService extends IpcServiceBase {
      publicMethod(): void {}
    }

    expect(
      Object.prototype.hasOwnProperty.call(AllModeService.prototype, "register")
    ).toBe(false)
    expect(getIpcMethodNames(AllModeService)).toEqual(["publicMethod"])
  })

  it("exposes only explicitly decorated methods in decorated mode", () => {
    @IpcInjectable("test-decorated", { exposeMode: "decorated" })
    class DecoratedService extends IpcServiceBase {
      @IpcMethod()
      exposed(): void {}

      internal(): void {}
    }

    expect(getIpcMethodNames(DecoratedService)).toEqual(["exposed"])
  })
})
