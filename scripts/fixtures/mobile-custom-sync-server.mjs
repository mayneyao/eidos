// Keep native test commands stable; this fixture owns its npm dependencies.
if (process.argv.includes("--check")) {
  const { loadFixtureEngine } = await import("./graft-remote/engine.mjs")
  await loadFixtureEngine()
  process.stdout.write(
    "Official Graft remote fixture 0.2.6 is ready (no listener started).\n"
  )
} else {
  await import("./graft-remote/server.mjs")
}
