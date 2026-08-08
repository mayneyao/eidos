const retired = "/legacy/"

export const legacyEnglishRoutes = {
  "/api-reference/ai/": retired,
  "/api-reference/cli/": "/cli/",
  "/api-reference/extension/": retired,
  "/api-reference/node/": retired,
  "/api-reference/relay/": retired,
  "/api-reference/space/": retired,
  "/api-reference/table/fields/": "/developers/runtime-quickstart/",
  "/api-reference/table/schema/": "/developers/runtime-quickstart/",
  "/api-reference/table/sdk/": "/developers/",
  "/api-reference/table/sql-functions/": "/specifications/runtime-1-0/",
  "/api-reference/table/views/": "/reference/eidos-file-custom-views/",
  "/automation/": "/cli/",
  "/comparisons/eidos-vs-obsidian/": "/getting-started/",
  "/concepts/extension/": retired,
  "/concepts/file/": "/concepts/",
  "/concepts/node/": retired,
  "/concepts/space/": "/getting-started/eidos-lite/",
  "/concepts/what-is-eidos/": "/getting-started/",
  "/extensions/api/": retired,
  "/extensions/block/": retired,
  "/extensions/cli/": "/cli/",
  "/extensions/eject/": retired,
  "/extensions/rawdata-adapter/": retired,
  "/extensions/script/": retired,
  "/how-to/": "/user-guide/",
  "/how-to/build-a-telegram-inbox/": retired,
  "/how-to/connect-telegram-bot/": retired,
  "/how-to/customize-new-tab/": retired,
  "/how-to/customize-theme/": retired,
  "/how-to/interact-with-desktop-app-via-api/": retired,
  "/how-to/setup-custom-sync-provider/": retired,
  "/how-to/use-cli/": "/cli/",
  "/how-to/use-semantic-search/": retired,
  "/nodes/dataview/": retired,
  "/nodes/doc/": retired,
  "/nodes/table/": retired,
  "/services/": retired,
  "/services/relay/": retired,
  "/services/spark-license/": retired,
  "/services/sync/": "/user-guide/history-and-sync/",
}

function localized(pathname) {
  return pathname === "/" ? "/zh-cn/" : `/zh-cn${pathname}`
}

const chineseRoutes = Object.fromEntries(
  Object.entries(legacyEnglishRoutes).map(([source, destination]) => [
    localized(source),
    localized(destination),
  ])
)

export const legacyRedirects = {
  ...legacyEnglishRoutes,
  ...chineseRoutes,
}
