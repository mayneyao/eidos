import { describe, expect, it } from "vitest"

import {
  DEFAULT_FILE_SPACE_SETTINGS,
  useFileSpaceSettings,
} from "./file-space-settings"

describe("file Space settings store", () => {
  it("backfills Base defaults for settings persisted by older versions", () => {
    useFileSpaceSettings.setState({
      bySpace: {
        legacy: {
          showHiddenFiles: true,
          showObsidianFolder: false,
        } as typeof DEFAULT_FILE_SPACE_SETTINGS,
      },
    })

    expect(useFileSpaceSettings.getState().getSettings("legacy")).toEqual({
      ...DEFAULT_FILE_SPACE_SETTINGS,
      showHiddenFiles: true,
    })
  })
})
