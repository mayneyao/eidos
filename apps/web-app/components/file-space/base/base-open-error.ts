export function baseOpenErrorPresentation(message: string | null): {
  title: string
  description: string
} {
  if (
    message?.includes("Not a SQLite file") ||
    message?.includes("invalid-sqlite")
  ) {
    return {
      title: "This Base is not a valid database",
      description:
        "The file may be empty, incomplete, or created by another application. Eidos has not changed it.",
    }
  }
  if (message?.includes("not-base")) {
    return {
      title: "This SQLite file is not an Eidos Base",
      description:
        "It does not contain the Base metadata required by Eidos. Open it with its original application or create a new Base.",
    }
  }
  return {
    title: "Eidos could not open this Base",
    description:
      "Check that the file still exists and is writable, then try again.",
  }
}
