export type EidosFileGridDateFormat = "date" | "datetime-local"

function twoDigits(value: number): string {
  return String(value).padStart(2, "0")
}

/** Formats a local date with a stable, fixed-width representation for the Grid. */
export function formatEidosFileGridDate(
  date: Date,
  format: EidosFileGridDateFormat
): string {
  const datePart = [
    date.getFullYear(),
    twoDigits(date.getMonth() + 1),
    twoDigits(date.getDate()),
  ].join("-")

  if (format === "date") return datePart

  const timePart = [
    twoDigits(date.getHours()),
    twoDigits(date.getMinutes()),
    twoDigits(date.getSeconds()),
  ].join(":")
  return `${datePart} ${timePart}`
}
