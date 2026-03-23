import { type EidosDatabase } from "@/packages/core/data-space"
import { registerLsdir } from "./lsdir"

export function registerDesktopUDFs(
  db: EidosDatabase,
  projectRoot: string,
  mountMap?: Record<string, string>
) {
  registerLsdir(db, projectRoot, mountMap)
}
