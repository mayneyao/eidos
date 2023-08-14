import { useRef } from "react"
import { IView } from "@/worker/meta_table/view"
import { useClickAway } from "ahooks"

interface IViewEditorProps {
  setEditDialogOpen: (open: boolean) => void
  view: IView
}
export const ViewEditor = ({ setEditDialogOpen, view }: IViewEditorProps) => {
  const ref = useRef<HTMLDivElement>(null)
  useClickAway(
    (e) => {
      console.log(e.target)
      setEditDialogOpen(false)
    },
    [ref],
    ["mousedown", "touchstart"]
  )
  return (
    <div
      className="absolute right-0 top-[53px] z-10 h-full w-[400px] bg-slate-50 dark:bg-slate-950"
      ref={ref}
    >
      <div>Not implement</div>
    </div>
  )
}
