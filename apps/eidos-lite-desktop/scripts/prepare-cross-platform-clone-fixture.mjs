import { cp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { RepositorySession } from "@eidos.space/graft"

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repositoryRoot = path.resolve(appRoot, "../..")
const targetRoot = path.resolve(process.argv[2] ?? "")

if (!process.argv[2]) {
  throw new Error("Expected the fixture output directory as the first argument")
}

await rm(targetRoot, { recursive: true, force: true })
await mkdir(targetRoot, { recursive: true })
await cp(
  path.join(
    repositoryRoot,
    "apps/eidos-file-web/fixtures/project-tracker.eidos"
  ),
  path.join(targetRoot, "project-tracker.eidos")
)

const repository = await RepositorySession.open(targetRoot)
try {
  await repository.init()
  await repository.addAll()
  await repository.commit("Cross-platform clone fixture")
  const status = await repository.status()
  if (status.dirty || status.paths.length > 0) {
    throw new Error(`Fixture is not clean: ${JSON.stringify(status)}`)
  }
} finally {
  await repository.close()
}
