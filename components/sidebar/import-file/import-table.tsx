import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useGoto } from "@/hooks/use-goto"
import { useSqlite } from "@/hooks/use-sqlite"
import { Input } from "@/components/ui/input"

export const ImportTable = ({
  setOpen,
}: {
  setOpen: (open: boolean) => void
}) => {
  const params = useCurrentPathInfo()
  const { space } = params
  const { sqlite } = useSqlite(space)
  const goto = useGoto()

  const handleCreateTable = async (file: File) => {
    const tableId = await sqlite?.importCsv({
      name: file.name,
      content: await file.text(),
    })
    if (tableId) {
      setOpen(false)
      goto(space, tableId)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <label
          htmlFor="csv"
          className="w-full cursor-pointer border p-2 text-center hover:bg-secondary"
        >
          CSV
        </label>
        <Input
          id="csv"
          className="hidden"
          type="file"
          accept=".csv"
          onChange={(e) => {
            if (e.target.files) {
              handleCreateTable(e.target.files[0])
            }
          }}
        />
      </div>
    </>
  )
}
