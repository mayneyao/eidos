import fs from "node:fs/promises"
import path from "node:path"

import type {
  EidosLiteAppearance,
  EidosLitePreferences,
} from "../shared/contracts"
import {
  DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
  normalizeEidosLiteKeyboardShortcuts,
} from "../shared/keyboard-shortcuts"

export const DEFAULT_EIDOS_LITE_PREFERENCES: EidosLitePreferences = {
  appearance: "system",
  language: "system",
  weekStartsOnMonday: true,
  keyboardShortcuts: { ...DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS },
  automaticUpdates: true,
  automaticCheckpoints: false,
  defaultSpaceLocation: null,
}

function appearance(value: unknown): EidosLiteAppearance {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : DEFAULT_EIDOS_LITE_PREFERENCES.appearance
}

function language(value: unknown): EidosLitePreferences["language"] {
  return value === "system" || value === "en" || value === "zh"
    ? value
    : DEFAULT_EIDOS_LITE_PREFERENCES.language
}

export function normalizeEidosLitePreferences(
  value: unknown
): EidosLitePreferences {
  const candidate =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {}
  const defaultSpaceLocation = candidate.defaultSpaceLocation
  return {
    appearance: appearance(candidate.appearance),
    language: language(candidate.language),
    weekStartsOnMonday:
      typeof candidate.weekStartsOnMonday === "boolean"
        ? candidate.weekStartsOnMonday
        : DEFAULT_EIDOS_LITE_PREFERENCES.weekStartsOnMonday,
    keyboardShortcuts: normalizeEidosLiteKeyboardShortcuts(
      candidate.keyboardShortcuts
    ),
    automaticUpdates:
      typeof candidate.automaticUpdates === "boolean"
        ? candidate.automaticUpdates
        : DEFAULT_EIDOS_LITE_PREFERENCES.automaticUpdates,
    automaticCheckpoints:
      typeof candidate.automaticCheckpoints === "boolean"
        ? candidate.automaticCheckpoints
        : DEFAULT_EIDOS_LITE_PREFERENCES.automaticCheckpoints,
    defaultSpaceLocation:
      typeof defaultSpaceLocation === "string" && defaultSpaceLocation.trim()
        ? defaultSpaceLocation
        : null,
  }
}

export class EidosLitePreferencesStore {
  private loaded: Promise<EidosLitePreferences> | null = null
  private mutation: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async get(): Promise<EidosLitePreferences> {
    this.loaded ??= this.load()
    return { ...(await this.loaded) }
  }

  update(patch: Partial<EidosLitePreferences>): Promise<EidosLitePreferences> {
    let result: EidosLitePreferences | null = null
    const operation = this.mutation.then(async () => {
      const current = await this.get()
      result = normalizeEidosLitePreferences({ ...current, ...patch })
      await this.write(result)
      this.loaded = Promise.resolve(result)
    })
    this.mutation = operation.catch(() => undefined)
    return operation.then(() => ({ ...result! }))
  }

  private async load(): Promise<EidosLitePreferences> {
    try {
      return normalizeEidosLitePreferences(
        JSON.parse(await fs.readFile(this.filePath, "utf8"))
      )
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code === "ENOENT" ||
        error instanceof SyntaxError
      ) {
        return { ...DEFAULT_EIDOS_LITE_PREFERENCES }
      }
      throw error
    }
  }

  private async write(preferences: EidosLitePreferences): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(preferences, null, 2)}\n`
    )
    await fs.rename(temporaryPath, this.filePath)
  }
}
