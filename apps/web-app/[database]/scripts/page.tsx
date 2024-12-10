import { useMemo, useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { useMount } from "ahooks"
import {
  AppWindowIcon,
  FilterIcon,
  FunctionSquareIcon,
  PencilRulerIcon,
  ShapesIcon,
  SparkleIcon,
  SquareCodeIcon,
  ToyBrickIcon,
} from "lucide-react"
import { useLoaderData, useRevalidator } from "react-router-dom"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"

import { NewExtensionButton } from "./components/NewExtensionButton"
import { ScriptCard } from "./components/ScriptCard"
import { useAllApps } from "./hooks/use-all-apps"
import { useAllBlocks } from "./hooks/use-all-blocks"
import { useDirHandleStore, useLocalScript } from "./hooks/use-local-script"
import { useScript } from "./hooks/use-script"
import { InstallScript } from "./install"

export const IconMap = {
  script: SquareCodeIcon,
  udf: FunctionSquareIcon,
  prompt: SparkleIcon,
  block: ShapesIcon,
  m_block: ToyBrickIcon,
  app: AppWindowIcon,
  doc_plugin: PencilRulerIcon,
}

const extensionTypes = [
  {
    id: "app",
    name: "App",
    icon: AppWindowIcon,
    isGlobal: true,
  },
  {
    id: "block",
    name: "Block",
    icon: ShapesIcon,
    isGlobal: true,
  },
  {
    id: "script",
    name: "Script",
    icon: SquareCodeIcon,
  },
  {
    id: "udf",
    name: "UDF",
    icon: FunctionSquareIcon,
  },
  {
    id: "prompt",
    name: "Prompt",
    icon: SparkleIcon,
  },
  {
    id: "m_block",
    name: "Micro Block",
    icon: ToyBrickIcon,
  },
  {
    id: "doc_plugin",
    name: "Doc Plugin",
    icon: PencilRulerIcon,
  },
]
export const ScriptPage = () => {
  const scripts = useLoaderData() as IScript[]
  const { space } = useCurrentPathInfo()
  const [filter, setFilter] = useState("All")
  const [searchTerm, setSearchTerm] = useState("")
  const [showEnabledOnly, setShowEnabledOnly] = useState(false)

  const blocks = useAllBlocks()
  const apps = useAllApps()
  const _scripts = useMemo(() => {
    return [
      ...scripts.filter((script) =>
        ["script", "udf", "prompt", "m_block", "doc_plugin"].includes(
          script.type
        )
      ),
      ...blocks.map((block) => ({
        id: block,
        name: block,
        type: "block",
        description: "Block",
        enabled: scripts.find((script) => script.id === block)?.enabled,
        version: "1.0.0",
        code: "",
      })),
      ...apps.map((app) => ({
        id: app.id,
        name: app.name,
        type: "app",
        enabled: scripts.find((script) => script.id === app.id)?.enabled,
        description: "App",
        version: "1.0.0",
        code: "",
      })),
    ] as IScript[]
  }, [apps, blocks, scripts])

  const filterExts = useMemo(() => {
    let filtered = _scripts

    // Apply type filter
    if (filter !== "All") {
      filtered = filtered.filter(
        (script) => script.type.toLowerCase() === filter.toLowerCase()
      )
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (script) =>
          script.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          script.description.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Add enabled filter
    if (showEnabledOnly) {
      filtered = filtered.filter((script) => script.enabled)
    }

    return filtered
  }, [filter, _scripts, searchTerm, showEnabledOnly])

  const { deleteScript, enableScript, disableScript, updateScript, addScript } =
    useScript()
  const revalidator = useRevalidator()

  useMount(() => {
    revalidator.revalidate()
  })

  const handleDelete = async (id: string) => {
    await deleteScript(id)
    revalidator.revalidate()
  }
  const { dirHandle, scriptId } = useDirHandleStore()
  const { reload } = useLocalScript()

  const handleToggleEnabled = async (script: IScript, checked: boolean) => {
    const { id } = script
    if (checked) {
      if (
        script.type === "block" &&
        scripts.findIndex((script) => script.id === id) === -1
      ) {
        await addScript({
          id,
          name: id.replace("block-", ""),
          type: "block",
          description: "Block",
          version: "1.0.0",
          code: "",
          enabled: true,
          commands: [],
        })
      }
      if (
        script.type === "app" &&
        scripts.findIndex((script) => script.id === id) === -1
      ) {
        await addScript({
          ...script,
          enabled: true,
          commands: [],
        })
      }
      await enableScript(id)
    } else {
      await disableScript(id)
    }
    revalidator.revalidate()
  }

  const { toast } = useToast()

  const handleReload = async () => {
    const script = await reload()
    await updateScript(script)
    revalidator.revalidate()
    toast({
      title: "Script Updated Successfully",
    })
  }
  return (
    <ScrollArea className="h-full w-full p-2 pt-0">
      <div className="flex w-full justify-between p-2 pt-1">
        <NewExtensionButton />

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Label
              className="text-sm text-muted-foreground"
              htmlFor="enabled-only"
            >
              Enabled Only
            </Label>
            <Switch
              id="enabled-only"
              checked={showEnabledOnly}
              onCheckedChange={setShowEnabledOnly}
            />
          </div>
          <Input
            className="h-[28px] w-[200px]"
            placeholder="Search extension..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Select
            onValueChange={(value) => {
              setFilter(value as string)
            }}
            defaultValue="All"
          >
            <SelectTrigger className="h-[28px] w-[180px]">
              <SelectValue placeholder="" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem key={"All"} value={"All"}>
                <div className="flex items-center gap-2">
                  <FilterIcon size={18} className=" opacity-60" />
                  All
                </div>
              </SelectItem>
              {extensionTypes.map((type) => {
                const Icon = IconMap[type.id as keyof typeof IconMap]
                return (
                  <SelectItem key={type.id} value={type.id}>
                    <div className="flex items-center gap-2">
                      <Icon size={18} className=" opacity-60" />
                      {type.name}{" "}
                      {type.isGlobal && (
                        <Badge variant="secondary">Global</Badge>
                      )}
                    </div>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          <InstallScript />
        </div>
      </div>
      <Separator />
      <div className="grid w-full grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
        {filterExts.map((script) => (
          <ScriptCard
            key={script.id}
            script={script}
            space={space}
            onDelete={handleDelete}
            onToggleEnabled={handleToggleEnabled}
            showReload={Boolean(dirHandle) && scriptId === script.id}
            onReload={handleReload}
          />
        ))}
      </div>
    </ScrollArea>
  )
}
