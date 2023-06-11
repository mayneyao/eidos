import pkgInfo from "package.json"

export const logger = console

logger.info(`current version: ${pkgInfo.version}`)
