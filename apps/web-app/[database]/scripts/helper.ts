import z from "zod"

import { toast } from "@/components/ui/use-toast"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { generateId, proxyURL } from "@/lib/utils"

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
  script: IScript
): "markdown" | "typescript" | "javascript" => {
  if (script.type === "prompt") {
    return "markdown"
  }

  if (script.ts_code || script.type === "m_block") {
    return "typescript"
  }

  return "javascript"
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

export const getScriptFromV0 = async (link: string): Promise<IScript> => {
  const data = await getV0Block(link)
  const newScriptId = generateId()

  // path to name "path": "components/github-release-stats.tsx",
  const name = data.path.split("/").pop()?.split(".")[0]
  const script: IScript = {
    id: newScriptId,
    name: name ?? "New Block " + newScriptId,
    type: "m_block",
    version: "0.0.1",
    commands: [],
    description: "A block from v0",
    ts_code: data.content,
    code: '',
  }
  return script
}
