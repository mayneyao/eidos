import { IScript } from "@/worker/web-worker/meta_table/script"
import { useMount } from "ahooks"
import {
  ChevronDownIcon,
  FunctionSquareIcon,
  RotateCcwIcon,
  SparkleIcon,
  SquareCodeIcon,
} from "lucide-react"
import { Link, useLoaderData, useRevalidator } from "react-router-dom"

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
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"

import { useDirHandleStore, useLocalScript } from "./hooks/use-local-script"
import { useNewScript } from "./hooks/use-new-script"
import { useScript } from "./hooks/use-script"
import { InstallScript } from "./install"

const IconMap = {
  script: SquareCodeIcon,
  udf: FunctionSquareIcon,
  prompt: SparkleIcon,
}
export const ScriptPage = () => {
  const scripts = useLoaderData() as IScript[]
  const { space } = useCurrentPathInfo()
  const { deleteScript, enableScript, disableScript, updateScript } =
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

  const handleToggleEnabled = async (id: string, checked: boolean) => {
    if (checked) {
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
    <div className="h-full w-full p-4">
      <div className="flex w-full justify-between p-2">
        <div className="flex">
          <Button
            className=" rounded-r-none"
            size="sm"
            onClick={() => handleCreateNewScript()}
          >
            New
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className=" h-9 rounded-r-md bg-primary p-1 text-primary-foreground hover:opacity-70">
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
        <InstallScript />
      </div>
      <Separator />
      <div className="grid w-full grid-cols-1 gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">
        {scripts.map((script) => {
          const Icon = IconMap[script.type]
          return (
            <div
              key={script.id}
              className="overflow-hidden rounded-lg border shadow-md transition-shadow duration-200 hover:shadow-lg"
            >
              <div className="p-4">
                <div className="flex justify-between">
                  <h2 className="mb-2 flex items-center gap-1 text-xl font-semibold">
                    <Icon />
                    {script.name}({script.version})
                  </h2>
                  <Switch
                    checked={script.enabled}
                    onCheckedChange={(checked) =>
                      handleToggleEnabled(script.id, checked)
                    }
                  ></Switch>
                </div>
                <p className="h-[50px]">{script.description}</p>
                <div className="flex items-end justify-between">
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
    </div>
  )
}
