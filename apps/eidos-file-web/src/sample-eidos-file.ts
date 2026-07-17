export const SAMPLE_BASE_URL = new URL(
  "../fixtures/project-tracker.eidos",
  import.meta.url
).href

export async function loadSampleEidosFile(): Promise<File> {
  const response = await fetch(SAMPLE_BASE_URL)
  if (!response.ok) {
    throw new Error(
      `The sample Eidos File could not be loaded (${response.status})`
    )
  }
  return new File([await response.arrayBuffer()], "project-tracker.eidos", {
    type: "application/vnd.eidos+sqlite3",
  })
}
