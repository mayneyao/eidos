function graftSmokeCommand(args) {
  if (!Array.isArray(args) || args.length === 0 || !args[0]) {
    throw new Error("Graft smoke command is required")
  }
  if (args.some((argument) => argument.includes("\0"))) {
    throw new Error("Graft smoke arguments cannot contain NUL")
  }
  return { transport: "cli", args: [...args] }
}

module.exports = { graftSmokeCommand }
