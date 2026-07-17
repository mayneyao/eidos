export function eidosFileOpenErrorPresentation(message: string | null): {
  title: string
  description: string
} {
  if (
    message?.includes("Not a SQLite file") ||
    message?.includes("invalid-sqlite")
  ) {
    return {
      title: "This Eidos File is not a valid database",
      description:
        "The file may be empty, incomplete, or created by another application. Eidos has not changed it.",
    }
  }
  if (message?.includes("not-eidos-file")) {
    return {
      title: "This SQLite file is not an Eidos File",
      description:
        "It does not contain the Eidos File metadata required by Eidos. Open it with its original application or create a new Eidos File.",
    }
  }
  return {
    title: "Eidos could not open this Eidos File",
    description:
      "Check that the file still exists and is writable, then try again.",
  }
}
