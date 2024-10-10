import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useGoto } from "@/hooks/use-goto"
import { useSqlite } from "@/hooks/use-sqlite"
import { Input } from "@/components/ui/input"

export const ImportDoc = ({
  setOpen,
}: {
  setOpen: (open: boolean) => void
}) => {
  const params = useCurrentPathInfo()
  const { space } = params
  const { sqlite } = useSqlite(space)
  const goto = useGoto()

  const handleCreateDoc = async (file: File) => {
    const docId = await sqlite?.importMarkdown({
      name: file.name,
      content: await file.text(),
    })
    if (docId) {
      setOpen(false)
      goto(space, docId)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <label
          htmlFor="markdown"
          className="w-full cursor-pointer border p-2 text-center hover:bg-secondary"
        >
          Markdown
        </label>
        <Input
          id="markdown"
          className="hidden"
          type="file"
          accept=".md,.markdown"
          onChange={(e) => {
            if (e.target.files) {
              handleCreateDoc(e.target.files[0])
            }
          }}
        />
      </div>
    </>
  )
}
