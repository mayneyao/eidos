import type * as Monaco from "monaco-editor"

import extensionSdkSource from "@/packages/extension-sdk/src/index.ts?raw"
import extensionSurfaceProtocolTypes from "@/packages/extension-surface-protocol/src/types.ts?raw"

const EXTENSION_PACKAGE_ROOT = ".eidos/extensions/"
const SDK_MODULE = "@eidos.space/extension-sdk"
const SURFACE_PROTOCOL_MODULE = "@eidos.space/extension-surface-protocol"
const SDK_VIRTUAL_PATH =
  "file:///node_modules/@eidos.space/extension-sdk/index.ts"
const SURFACE_PROTOCOL_VIRTUAL_PATH =
  "file:///node_modules/@eidos.space/extension-surface-protocol/index.ts"

export function isFileExtensionSourcePath(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/").replace(/^\.\/+/, "")
  return normalizedPath.startsWith(EXTENSION_PACKAGE_ROOT)
}

export function configureFileExtensionEditorTypes(
  monaco: typeof Monaco,
  filePath: string
): void {
  if (!isFileExtensionSourcePath(filePath)) return

  const languageDefaults = [
    monaco.languages.typescript.typescriptDefaults,
    monaco.languages.typescript.javascriptDefaults,
  ]

  for (const defaults of languageDefaults) {
    const extraLibs = defaults.getExtraLibs()
    if (!extraLibs[SURFACE_PROTOCOL_VIRTUAL_PATH]) {
      defaults.addExtraLib(
        extensionSurfaceProtocolTypes,
        SURFACE_PROTOCOL_VIRTUAL_PATH
      )
    }
    if (!extraLibs[SDK_VIRTUAL_PATH]) {
      defaults.addExtraLib(extensionSdkSource, SDK_VIRTUAL_PATH)
    }

    const compilerOptions = defaults.getCompilerOptions()
    defaults.setCompilerOptions({
      ...compilerOptions,
      allowNonTsExtensions: true,
      baseUrl: "file:///",
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      paths: {
        ...compilerOptions.paths,
        [SDK_MODULE]: ["node_modules/@eidos.space/extension-sdk/index.ts"],
        [SURFACE_PROTOCOL_MODULE]: [
          "node_modules/@eidos.space/extension-surface-protocol/index.ts",
        ],
      },
    })
  }
}
