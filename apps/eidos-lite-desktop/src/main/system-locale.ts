import { app } from "electron"

// Chromium can select a secondary language when the first system language
// has no bundled locale. Lite resolves its own copy from the system preference.
export function getEidosLiteSystemLocale(): string {
  return app.getPreferredSystemLanguages()[0] ?? app.getLocale()
}
