import { useAppRuntimeStore } from "@/lib/store/runtime-store"
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

  return (
    <AlertDialog open={open}>
      <AlertDialogTrigger className="fixed bottom-1"></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <div className="text-lg font-bold">Processing</div>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Progress value={blockUIData?.progress || 0} max={100} />
            This may take a while, please wait...
            <br />
            {blockUIMsg}
          </AlertDialogDescription>
        </AlertDialogHeader>
      </AlertDialogContent>
    </AlertDialog>
  )
}
