import z from "zod"

import { toast } from "@/components/ui/use-toast"
import { proxyURL } from "@/lib/utils"
import eidosTypes from "@/packages/core/dist/index.d.ts?raw"
import type { IExtension } from "@/packages/core/meta-table/extension"

import { parse } from "comment-parser"


export const getDescriptionFromCode = (code: string) => {
  const comments = parse(code)
  const comment = comments[0]
  return comment?.description
}

export const PromptEnableCheck = z.object({
  model: z.string().refine((value) => value.trim() !== "", {
    message: "Model cannot be empty",
    path: ["model"],
  }),
  actions: z.array(z.string()).nullable().optional(),
})

export const checkPromptEnable = (data: unknown) => {
  const result = PromptEnableCheck.safeParse(data)
  if (!result.success) {
    toast({
      title: `please check your settings`,
      description: `[${result.error.errors[0].path}]: ${result.error.errors[0].message}`,
    })
    throw new Error(result.error.errors[0].message)
  }
  return result.data
}

export const getEditorLanguage = (
  script: IExtension
): "typescript" => {
  // Always return typescript - JSX support is handled by file extension
  // script → .ts, block → .tsx
  return "typescript"
}

export const getFileExtension = (script: IExtension): string => {
  // script → .ts, block → .tsx
  return script.type === "block" ? ".tsx" : ".ts"
}

function getRegistryUrl(path: string) {
  const url = new URL(path)
  if (url.pathname.match(/\/chat\/b\//) && !url.pathname.endsWith("/json")) {
    url.pathname = `${url.pathname}/json`
  }
  return url.toString()
}


interface RegistryFile {
  path: string
  type: string
  content: string
}

interface RegistryResponse {
  name: string
  type: string
  dependencies: string[]
  devDependencies: string[]
  registryDependencies: string[]
  files: RegistryFile[]
  tailwind: Record<string, any>
  cssVars: Record<string, any>
  meta: {
    importSpecifier: string
    moduleSpecifier: string
  }
}



export const getV0Block = async (link: string) => {
  /**
   * 1. https://v0.dev/chat/b/ZzbGuhRMKPX
   * 2. npx shadcn@latest add https://v0.dev/chat/b/ZzbGuhRMKPX
   * 3. npx shadcn@latest add "https://v0.dev/chat/b/ZzbGuhRMKPX"
   */
  const _link = link.trim()
    .replace(/^npx\s+shadcn@latest\s+add\s+/, '')
    .replace(/^["']|["']$/g, '')
    .trim()

  const url = getRegistryUrl(_link)
  console.log('Fetching URL:', url)
  const res = await fetch(proxyURL(url))
  const data = await res.json() as RegistryResponse
  return data.files[0]
}



export const getDynamicPrompt = (bindings: IExtension["bindings"]) => {
  const replaceText = `table(id: string): TableManager;`
  const bindingText = Object.entries(bindings || {})
    .map(([key, value]) => {
      return `${key}: TableManager;`
    })
    .join("\n")

  // Add global eidos variable declaration
  const eidosGlobalDeclaration = `
declare global {
  const eidos: Eidos;
}
`

  let replaced = eidosTypes.replace(replaceText, replaceText + "\n" + bindingText)
  // Add global eidos declaration at the end
  replaced = replaced + eidosGlobalDeclaration
  return replaced
}



