export const SAMPLE_BASE_URL = new URL(
  "../fixtures/project-tracker.base",
  import.meta.url
).href

export async function loadSampleBaseFile(): Promise<File> {
  const response = await fetch(SAMPLE_BASE_URL)
  if (!response.ok) {
    throw new Error(`The sample Base could not be loaded (${response.status})`)
  }
  return new File([await response.arrayBuffer()], "project-tracker.base", {
    type: "application/vnd.eidos.base+sqlite3",
  })
}
