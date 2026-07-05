import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Progress } from "@/components/ui/progress"

export const BlockUIDialog = () => {
  const { blockUIMsg, blockUIData } = useAppRuntimeStore()
  const open = blockUIMsg !== null
  const title =
    typeof blockUIData?.title === "string" ? blockUIData.title : "Processing"
  const progress =
    typeof blockUIData?.progress === "number" ? blockUIData.progress : 0
  const description =
    typeof blockUIData?.description === "string"
      ? blockUIData.description
      : "This may take a while, please wait..."

  return (
    <AlertDialog open={open}>
      <AlertDialogTrigger className="fixed bottom-1"></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <div className="text-lg font-bold">{title}</div>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Progress value={progress} max={100} />
            {description}
            <br />
            {blockUIMsg}
          </AlertDialogDescription>
        </AlertDialogHeader>
      </AlertDialogContent>
    </AlertDialog>
  )
}
