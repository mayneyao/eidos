import { defaultFilter } from "cmdk"

export function isUrlLike(value: string): boolean {
  if (!value || value.length < 3) return false
  return /^https?:\/\/[^\s]+|^[a-z0-9]+([\-.]{1}[a-z0-9]+)*\.[a-z]{2,}(:[0-9]{1,5})?(\/.*)?$/i.test(
    value.trim()
  )
}

export function shouldPrioritizeFileExtensionCommands(
  input: string,
  isFileSpace: boolean
): boolean {
  return isFileSpace && input.trim().length > 0 && !isUrlLike(input)
}

export function getPreferredCommandValue(
  input: string,
  commandValues: string[]
): string | undefined {
  const query = input.trim()
  if (!query) return undefined

  let preferred: { value: string; score: number } | undefined
  for (const value of commandValues) {
    const score = defaultFilter(value, query)
    if (score > 0 && (!preferred || score > preferred.score)) {
      preferred = { value, score }
    }
  }
  return preferred?.value
}
