import fs from "node:fs/promises"

// Adjusted the path to reflect the new script location inside the scripts directory
const file = await fs.readFile("./packages/types/index.d.ts", "utf-8")

// replace  "worker/web-worker/sdk/index" => "@eidos.space/types"
const newFile = file.replace(
  /"worker\/web-worker\/sdk\/index"/g,
  '"@eidos.space/types"'
)

console.log("fix types success")
// Adjusted the path here as well
await fs.writeFile("./packages/types/index.d.ts", newFile)
