/**
 * Extension Server Middleware
 * Handles <extId>.block.<spaceId>.eidos.localhost requests
 *
 * This middleware is dependency-free and uses injection for all external dependencies.
 */

// vm import removed as it is now handled by provider.dataSpace.runServerAction via RPC or direct call
import type { Context } from "hono"
import type { BlankEnv } from "hono/types"

import { getIndexHtml, type ExtensionContext } from "./ext-html"
import { presetThemes, twConfig } from "./helper"
import type {
  ExtServerConfig,
  ExtensionProvider,
  IBindings,
  IExtension,
} from "./types"

type Ctx = Context<BlankEnv, "*", {}>

// Default hostname patterns
const DEFAULT_EXTENSION_PATTERN =
  /^([a-zA-Z0-9-]+)\.block\.(.*?)\.eidos\.localhost$/
const DEFAULT_SANDBOX_PATTERN = /^sandbox\.(.*?)\.eidos\.localhost$/

/**
 * Extract environment variables from bindings
 */
function getEnvMap(bindings?: IBindings): Record<string, string> {
  const envMap: Record<string, string> = {}
  if (!bindings) return envMap

  Object.entries(bindings).forEach(([key, value]) => {
    if (value.type === "secret" || value.type === "text") {
      envMap[key] = value.value
    }
  })
  return envMap
}



/**
 * Render extension to HTML
 */
async function renderExtension(
  config: ExtServerConfig,
  provider: ExtensionProvider,
  spaceId: string,
  extension: IExtension,
  url: string
): Promise<string> {
  const start = performance.now()
  const { dependencies } = config

  // Generate SDK injection script
  const sdkInjectScriptContent = dependencies.makeSdkInjectScript({
    space: spaceId,
    bindings: extension.bindings,
  })

  const tsCode = extension.ts_code || ""
  const compiledCode = extension.code || ""

  // Get all required libraries
  const { thirdPartyLibs, uiLibs, cssLibs, localLibs } =
    await dependencies.getAllLibs(
      tsCode,
      dependencies.uiComponentsDependencies,
      async (localLibPath) => {
        let resolvedSlug: string
        if (extension.slug && localLibPath.startsWith("./")) {
          const slugDir = extension.slug.includes("/")
            ? extension.slug.substring(0, extension.slug.lastIndexOf("/"))
            : ""
          const relativePath = localLibPath.substring(2)
          resolvedSlug = slugDir ? `${slugDir}/${relativePath}` : relativePath
        } else {
          resolvedSlug = localLibPath.split("/").pop() || localLibPath
        }

        if (resolvedSlug && provider.getBySlugOrId) {
          const ext = await provider.getBySlugOrId(resolvedSlug)
          return ext?.code || null
        }
        return null
      }
    )

  // Handle server-side props
  let serverSideProps = {}
  const serverActionCode = dependencies.extractFunction(
    tsCode,
    "getServerSideProps"
  )
  if (serverActionCode) {
    try {
      const result = await provider.dataSpace.runServerAction(
        `(${serverActionCode})(context)`,
        { url }
      )
      serverSideProps = result?.props || {}
    } catch (error) {
      console.error("[ExtServer] Error running server action:", error)
    }
  }

  // Preload common libs
  thirdPartyLibs.push(
    "@radix-ui/react-icons",
    "@radix-ui/react-toast",
    "class-variance-authority",
    "lucide-react"
  )
  uiLibs.push("toast", "toaster", "use-toast")

  // Generate import map
  const { importMapScript, cssLoaderScript } =
    await dependencies.generateImportMap(
      { thirdPartyLibs, uiLibs, cssLibs, localLibs },
      spaceId,
      extension.slug
    )

  // Get theme
  const dynamicThemes = config.getCustomThemes?.() || []
  const allThemes = [
    ...presetThemes,
    ...(config.customThemes || []),
    ...dynamicThemes,
  ]

  // Get theme CSS - prefer current theme name from config
  let themeRawCss = ""
  const currentThemeName = config.getCurrentThemeName?.()
  if (currentThemeName) {
    const theme = allThemes.find((t) => t.name === currentThemeName)
    themeRawCss = theme?.css || allThemes[0]?.css || ""
  } else {
    themeRawCss = allThemes[0]?.css || ""
  }

  let themeMode: string = config.themeMode || "light"
  if (!config.themeMode && provider.getThemeMode) {
    const providerTheme = await provider.getThemeMode()
    if (providerTheme === "light" || providerTheme === "dark") {
      themeMode = providerTheme
    }
  }

  // Build extension context - prefer provider.getSyncEnabled over config.syncEnabled
  const syncEnabled = provider.getSyncEnabled?.() ?? config.syncEnabled ?? false
  const extensionContext: ExtensionContext = {
    type: extension.meta?.type,
    locale: "en",
    syncEnabled,
  }

  // Generate HTML
  const html = getIndexHtml({
    theme: themeMode,
    importMap: importMapScript,
    cssLoaderScript,
    sdkInjectScriptContent,
    envString: JSON.stringify(getEnvMap(extension.bindings)),
    twConfig,
    compiledCode,
    defaultPropsString: JSON.stringify({}),
    serverSideProps,
    rawThemeCss: themeRawCss,
    extensionContext,
  })

  const end = performance.now()
  console.log(`[ExtServer] Rendered in ${(end - start).toFixed(2)}ms`)
  return html
}

/**
 * Create extension middleware for Hono
 *
 * @example
 * ```typescript
 * import { createExtensionMiddleware } from '@eidos.space/ext-server';
 * import { makeSdkInjectScript } from '@eidos.space/sandbox';
 * import { extractFunction, getAllLibs, generateImportMap, uiComponentsDependencies } from '@eidos.space/v3';
 *
 * app.use('*', createExtensionMiddleware({
 *   getExtensionProvider: async (spaceId) => ({
 *     getById: async (id) => db.extensions.findOne({ id }),
 *     getBySlug: async (slug) => db.extensions.findOne({ slug }),
 *   }),
 *   dependencies: {
 *     makeSdkInjectScript,
 *     extractFunction,
 *     getAllLibs,
 *     generateImportMap,
 *     uiComponentsDependencies,
 *   },
 * }));
 * ```
 */
export const createExtensionMiddleware = (config: ExtServerConfig) => {
  const extensionPattern = config.hostnamePattern || DEFAULT_EXTENSION_PATTERN
  const sandboxPattern =
    config.sandboxHostnamePattern || DEFAULT_SANDBOX_PATTERN

  return async (c: Ctx, next: () => Promise<void>) => {
    const url = new URL(c.req.url)
    const hostname = url.hostname

    const jsHeaders = new Headers()
    jsHeaders.append("Content-Type", "text/javascript")
    jsHeaders.append("Cross-Origin-Embedder-Policy", "require-corp")

    // Serve static JS files - must be provided via config.staticAssets
    const assets = config.staticAssets
    if (url.pathname === "/sw.js" && assets?.swJs) {
      return new Response(assets.swJs, { headers: jsHeaders })
    }
    if (url.pathname === "/app-wrapper.js" && assets?.appWrapperJs) {
      return new Response(assets.appWrapperJs, { headers: jsHeaders })
    }
    if (url.pathname === "/tailwind-raw.js" && assets?.tailwindRawJs) {
      return new Response(assets.tailwindRawJs, { headers: jsHeaders })
    }
    if (url.pathname === "/eidos-client.js" && assets?.eidosClientJs) {
      return new Response(assets.eidosClientJs, { headers: jsHeaders })
    }

    // Serve compiled UI files (desktop feature)
    if (url.pathname.startsWith("/compiled-ui") && config.serveCompiledUI) {
      const fileBuffer = config.serveCompiledUI(url.pathname)
      if (fileBuffer) {
        // Convert Buffer to Uint8Array for Response body
        const body = new Uint8Array(fileBuffer)
        return new Response(body, { headers: jsHeaders })
      }
    }

    // Check for sandbox domain
    const sandboxMatch = hostname.match(sandboxPattern)
    if (sandboxMatch && config.dependencies.createSandboxHandler) {
      const spaceId = sandboxMatch[1]
      const provider = await config.getExtensionProvider(spaceId)

      const getScriptCode = async (sid: string, scriptId: string) => {
        const ext = await provider.getById(scriptId)
        if (!ext && provider.getBySlug) {
          const extBySlug = await provider.getBySlug(scriptId)
          return extBySlug?.code || null
        }
        return ext?.code || null
      }

      const sandboxHandler =
        config.dependencies.createSandboxHandler(getScriptCode)
      console.log("[ExtServer] Intercepting sandbox request:", c.req.url)
      return sandboxHandler.handleSandboxRequest(spaceId, url, c)
    }

    // Check for extension pattern
    const match = hostname.match(extensionPattern)
    if (match) {
      const extensionId = match[1]
      const spaceId = match[2]

      // Skip special paths
      if (
        url.pathname.startsWith("/files/") ||
        url.pathname.startsWith("/~/") ||
        url.pathname.startsWith("/@/") ||
        url.pathname === "/rpc"
      ) {
        return next()
      }

      try {
        const provider = await config.getExtensionProvider(spaceId)
        let extension = await provider.getById(extensionId)

        if (!extension && provider.getBySlug) {
          extension = await provider.getBySlug(extensionId)
        }

        if (!extension) {
          return c.text(`Extension not found: ${extensionId}`, 404)
        }

        // Serve compiled extension code
        if (url.pathname === "/app.js") {
          return c.body(extension.code || "", { headers: jsHeaders })
        }

        // Render extension HTML
        const html = await renderExtension(
          config,
          provider,
          spaceId,
          extension,
          url.toString()
        )

        const htmlHeaders = new Headers()
        htmlHeaders.append("Content-Type", "text/html; charset=utf-8")
        htmlHeaders.append(
          "Content-Security-Policy",
          "frame-src 'self' http://localhost:* http://*.eidos.localhost:*;"
        )
        htmlHeaders.append(
          "Cross-Origin-Opener-Policy",
          "same-origin-allow-popups"
        )
        htmlHeaders.append("Cross-Origin-Resource-Policy", "cross-origin")

        return c.html(html, { headers: htmlHeaders })
      } catch (error: any) {
        console.error(
          `[ExtServer] Error processing request for ${hostname}:`,
          error.message
        )
        return c.text(
          `Error processing extension request: ${error.message}`,
          500
        )
      }
    }

    // If the hostname doesn't match, proceed to next
    await next()
  }
}
