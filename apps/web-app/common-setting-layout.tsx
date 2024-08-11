import { useKeyPress } from "ahooks"
import { Minimize2 } from "lucide-react"

import { useLastOpened } from "@/apps/web-app/[database]/hook"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useGoto } from "@/hooks/use-goto"

export function CommonSettingLayout(props: {
  children: React.ReactNode
  title?: string
  description?: string
}) {
  const { title, description, children } = props
  const { lastOpenedTable, lastOpenedDatabase } = useLastOpened()
  const goto = useGoto()

  const goBack = () => goto(lastOpenedDatabase, lastOpenedTable)
  useKeyPress("esc", (e) => {
    e.preventDefault()
    goBack()
  })

  return (
    <div className="grid w-full grid-cols-5 ">
      <div className="col-span-1" />
      <div className="col-span-5 space-y-6 p-4 pb-16 md:block md:p-10 xl:col-span-3">
        <div className="flex items-start justify-between">
          <div className="space-y-0.5">
            <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            <p className="text-muted-foreground">{description}</p>
          </div>
          <Button variant="ghost" onClick={goBack}>
            <Minimize2 className="mr-2 h-4 w-4" /> ESC
          </Button>
        </div>
        <Separator className="my-6" />
        <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
          <div className="flex-1 lg:max-w-2xl">{children}</div>
        </div>
      </div>
      <div className="col-span-1" />
    </div>
  )
}
