import { useMemo, useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import { useMount } from "ahooks"
import {
  AppWindowIcon,
  ChevronDownIcon,
  FilterIcon,
  FunctionSquareIcon,
  RotateCcwIcon,
  ShapesIcon,
  SparkleIcon,
  SquareCodeIcon,
} from "lucide-react"
import { Link, useLoaderData, useRevalidator } from "react-router-dom"

import { cn } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

import { useAllApps } from "./hooks/use-all-apps"
import { useAllBlocks } from "./hooks/use-all-blocks"
import { useDirHandleStore, useLocalScript } from "./hooks/use-local-script"
import { useNewScript } from "./hooks/use-new-script"
import { useScript } from "./hooks/use-script"
import { InstallScript } from "./install"

const IconMap = {
  script: SquareCodeIcon,
  udf: FunctionSquareIcon,
  prompt: SparkleIcon,
  block: ShapesIcon,
  app: AppWindowIcon,
}

const extensionTypes = [
  {
    name: "App",
    icon: AppWindowIcon,
    isGlobal: true,
  },
  {
    name: "Block",
    icon: ShapesIcon,
    isGlobal: true,
  },
  {
    name: "Script",
    icon: SquareCodeIcon,
  },
  {
    name: "UDF",
    icon: FunctionSquareIcon,
  },
  {
    name: "Prompt",
    icon: SparkleIcon,
  },
]
export const ScriptPage = () => {
  const scripts = useLoaderData() as IScript[]
  const { space } = useCurrentPathInfo()
  const [filter, setFilter] = useState("All")

  const blocks = useAllBlocks()
  const apps = useAllApps()
  const _scripts = useMemo(() => {
    return [
      ...scripts.filter((script) =>
        ["script", "udf", "prompt"].includes(script.type)
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
    if (filter === "All") {
      return _scripts
    }
    return _scripts.filter(
      (script) => script.type.toLocaleLowerCase() === filter.toLowerCase()
    )
  }, [filter, _scripts])

  const { deleteScript, enableScript, disableScript, updateScript, addScript } =
    useScript()
  const revalidator = useRevalidator()

  useMount(() => {
    revalidator.revalidate()
  })

  const { handleCreateNewScript } = useNewScript()
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
        <div className="flex">
          <Button
            className=" rounded-r-none"
            size="xs"
            onClick={() => handleCreateNewScript()}
          >
            New
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className="h-7 rounded-r-md bg-primary p-1 text-primary-foreground hover:opacity-70">
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>
                New Extension With Different Template
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleCreateNewScript("udf")}>
                UDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreateNewScript("prompt")}>
                Prompt
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex gap-2">
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
                const Icon =
                  IconMap[type.name.toLowerCase() as keyof typeof IconMap]
                return (
                  <SelectItem key={type.name} value={type.name}>
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
      <div className="grid w-full grid-cols-1 gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">
        {filterExts.map((script) => {
          const Icon = IconMap[script.type]
          return (
            <div
              key={script.id}
              className="overflow-hidden rounded-lg border shadow-md transition-shadow duration-200 hover:shadow-lg"
            >
              <div className="p-4">
                <div className="flex  items-baseline justify-between">
                  <h2 className="mb-2 flex items-center gap-1 truncate text-xl font-semibold">
                    <Icon className="shrink-0" />
                    {script.name}({script.version})
                  </h2>
                  {script.type !== "app" && (
                    <Switch
                      checked={script.enabled}
                      onCheckedChange={(checked) =>
                        handleToggleEnabled(script, checked)
                      }
                    ></Switch>
                  )}
                  {/* {script.type === "app" && (
                    <Link to={`/${space}/apps/${script.id}`}>
                      <Button size="sm" variant="outline">
                        Open
                      </Button>
                    </Link>
                  )} */}
                </div>
                <p className="h-[50px]">{script.description}</p>

                <div
                  className={cn("flex items-end justify-between", {
                    "opacity-0 pointer-events-none": ["block", "app"].includes(
                      script.type
                    ),
                  })}
                >
                  <div className="flex gap-2">
                    <Link to={`/${space}/extensions/${script.id}`}>
                      <Button className="mt-4" variant="outline">
                        Details
                      </Button>
                    </Link>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" className="ml-4 mt-4">
                          Remove
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Are you sure you want to delete this script?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. all data related to
                            this will be deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(script.id)}
                          >
                            Continue
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  {Boolean(dirHandle) && scriptId === script.id && (
                    <Button
                      onClick={handleReload}
                      variant="ghost"
                      title="Reload Local Script"
                    >
                      <RotateCcwIcon></RotateCcwIcon>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
