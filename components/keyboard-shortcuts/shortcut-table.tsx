import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface ShortcutTableProps {
  shortcuts: { key: string; description: string; disabled?: boolean }[]
  title?: string
}
export const ShortcutTable = ({ shortcuts, title }: ShortcutTableProps) => {
  return (
    <div className="flex flex-col">
      <h2 className=" px-2 font-medium">{title || "Keyboard Shortcuts"}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Shortcut</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shortcuts.map((shortcut) => (
            <TableRow key={shortcut.key} className="h-4">
              <TableCell className="p-[6px]">
                <div className="flex items-center gap-2">
                  {shortcut.key.split(" + ").map((key) => (
                    <kbd
                      key={key}
                      className="rounded bg-muted p-1 font-mono text-sm"
                    >
                      {key}
                    </kbd>
                  ))}
                </div>
              </TableCell>
              <TableCell
                className={`p-[6px] ${
                  shortcut.disabled ? "text-gray-400" : "text-muted-foreground"
                }`}
              >
                {shortcut.description}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
