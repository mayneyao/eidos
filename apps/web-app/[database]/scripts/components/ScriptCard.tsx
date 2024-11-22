import { IScript } from "@/worker/web-worker/meta-table/script"
import {
  AppWindowIcon,
  FunctionSquareIcon,
  RotateCcwIcon,
  ShapesIcon,
  SparkleIcon,
  SquareCodeIcon,
  ToyBrickIcon,
} from "lucide-react"
import { Link } from "react-router-dom"

import { cn } from "@/lib/utils"
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
import { Switch } from "@/components/ui/switch"

const IconMap = {
  script: SquareCodeIcon,
  udf: FunctionSquareIcon,
  prompt: SparkleIcon,
  block: ShapesIcon,
  m_block: ToyBrickIcon,
  app: AppWindowIcon,
}

interface ScriptCardProps {
  script: IScript
  space: string
  onDelete: (id: string) => void
  onToggleEnabled: (script: IScript, checked: boolean) => void
  showReload?: boolean
  onReload?: () => void
}

export const ScriptCard = ({
  script,
  space,
  onDelete,
  onToggleEnabled,
  showReload,
  onReload,
}: ScriptCardProps) => {
  const Icon = IconMap[script.type]

  return (
    <div className="group relative overflow-hidden rounded-lg border bg-card text-card-foreground shadow transition-all hover:shadow-lg flex flex-col min-h-[160px]">
      <div className="flex flex-col space-y-1.5 p-4">
        <div className="flex items-center gap-2">
          <Icon className="h-10 w-10 shrink-0 opacity-70" />
          <div>
            <h3 className="text-lg font-semibold tracking-tight">
              {script.name}{" "}
              <span className="text-sm text-muted-foreground">
                v{script.version}
              </span>
            </h3>
            <p className="text-sm text-muted-foreground">
              {script.description}
            </p>
          </div>
        </div>
      </div>

      <div
        className={cn("flex items-center justify-between p-4 pt-0 mt-auto", {
          "opacity-0 pointer-events-none": ["block", "app"].includes(
            script.type
          ),
        })}
      >
        <div className="flex items-center gap-2">
          <Link to={`/${space}/extensions/${script.id}`}>
            <Button size="xs" variant="outline">
              Details
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="xs" variant="ghost">
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Are you sure you want to delete this script?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. All data related to this will be
                  deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(script.id)}>
                  Continue
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="flex items-center gap-2">
          {script.type !== "app" && (
            <Switch
              checked={script.enabled}
              onCheckedChange={(checked) => onToggleEnabled(script, checked)}
            />
          )}
          {showReload && (
            <Button
              onClick={onReload}
              variant="ghost"
              size="icon"
              title="Reload Local Script"
            >
              <RotateCcwIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
