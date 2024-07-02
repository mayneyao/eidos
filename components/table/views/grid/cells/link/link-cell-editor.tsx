import { useEffect, useMemo, useState } from "react"
import { Check } from "lucide-react"

import { LinkCellData } from "@/lib/fields/link"
import { cn } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"

interface IGridProps {
  tableName: string
  databaseName: string
  value: LinkCellData[]
  onChange: (data: LinkCellData[]) => void
}

export function LinkCellEditor(props: IGridProps) {
  const { tableName } = props
  const [search, setSearch] = useState("")
  const [data, setData] = useState<any[]>([])

  const { sqlite } = useSqlite()
  useEffect(() => {
    if (!sqlite) return
    if (search.length) {
      sqlite
        .sql4mainThread(
          `SELECT * FROM ${tableName} WHERE title LIKE '%' || ? || '%' LIMIT 10`,
          [search],
          "object"
        )
        .then((res) => {
          setData(res)
        })
    } else {
      sqlite
        .sql4mainThread(`SELECT * FROM ${tableName} LIMIT 10`, [], "object")
        .then((res) => {
          setData(res)
        })
    }
  }, [tableName, search, sqlite])

  const selectItem = (item: { _id: string; title: string }) => {
    if (props.value.find((v) => v.id === item._id)) {
      props.onChange(props.value.filter((v) => v.id !== item._id))
      return
    } else {
      props.onChange([
        ...props.value,
        {
          id: item._id,
          title: item.title,
        },
      ])
    }
  }

  const unSelectedItems = useMemo(() => {
    return data.filter((item) => !props.value.find((v) => v.id === item._id))
  }, [props.value, data])

  return (
    <div className="min-w-[300px]">
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search..."
          value={search}
          autoFocus
          onValueChange={setSearch}
        />
        <CommandEmpty>No record found.</CommandEmpty>
        {Boolean(props.value.length) && (
          <CommandGroup heading="Selected">
            {props.value.map((item, index) => {
              return (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={(currentValue) => {
                    selectItem({
                      _id: currentValue,
                      title: item.title,
                    })
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4 ", "opacity-100")} />
                  {item.title || "Untitled"}
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}
        {Boolean(unSelectedItems.length) && (
          <CommandGroup heading="Select Other">
            {unSelectedItems.map((item, index) => {
              return (
                <CommandItem
                  key={item._id}
                  value={item._id}
                  onSelect={(currentValue) => {
                    selectItem(item)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", "opacity-0")} />
                  {item.title || "Untitled"}
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}
      </Command>
    </div>
  )
}
