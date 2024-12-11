import * as React from "react"
import { DataSpace } from "@/worker/web-worker/DataSpace"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getNodeByKey } from "lexical"

import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { $isSQLNode, SQLNode } from "./node"
import { useModal } from "../../hooks/useModal"
import { SqlQueryDialog } from "./dialog"
import { QueryResultType, getQueryResultType } from "./helper"

type SQLProps = {
  sql: string
  nodeKey: string
}

const SqlTable = ({
  data,
  sql,
  handleClick,
}: {
  sql: string
  data: Record<string, any>[]
  handleClick: () => void
}) => {
  const keys = Object.keys(data[0])
  return (
    <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="border-b border-gray-200 dark:border-gray-800">
        <Button
          onClick={handleClick}
          variant="ghost"
          size="sm"
          className="select-none"
        >
          SQL Query
        </Button>
        <span className="opacity-50">{sql}</span>
      </div>
      <Table className="my-0">
        <TableHeader>
          <TableRow>
            {keys.map((key) => (
              <TableHead className="whitespace-nowrap" key={key}>
                {key}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, index) => (
            <TableRow key={index}>
              {keys.map((key) => (
                <TableCell className="whitespace-nowrap" key={key}>
                  {item[key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

const List = ({
  data,
  handleClick,
  sql,
}: {
  sql: string
  data: Record<string, any>[]
  handleClick: () => void
}) => {
  return (
    <div className="rounded-sm border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="border-b border-gray-200 dark:border-gray-800">
        <Button
          onClick={handleClick}
          variant="ghost"
          size="sm"
          className="select-none"
        >
          SQL Query
        </Button>
        <span className="opacity-50">{sql}</span>
      </div>
      <div className="flex cursor-pointer flex-col">
        {data.map((item, index) => (
          <div
            className="px-2 py-1 text-gray-500 hover:bg-secondary dark:text-gray-400"
            key={index}
          >
            {item[Object.keys(item)[0]]}
          </div>
        ))}
      </div>
    </div>
  )
}

const Card = ({
  data,
  handleClick,
  sql,
}: {
  sql: string
  data: Record<string, any>
  handleClick: () => void
}) => {
  return (
    <div className="rounded-sm border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="border-b border-gray-200 dark:border-gray-800">
        <Button
          onClick={handleClick}
          variant="ghost"
          size="sm"
          className="select-none"
        >
          SQL Query
        </Button>
        <span className="opacity-50">{sql}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 p-2 px-4">
        {Object.entries(data).map(([key, value]) => (
          <React.Fragment key={key}>
            <div className="text-gray-500 dark:text-gray-400">{key}</div>
            <div>{value}</div>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

export function SQLComponent({ sql, nodeKey }: SQLProps) {
  const [res, setRes] = React.useState<Record<string, any>[]>([])
  const [renderType, setRenderType] = React.useState<QueryResultType>()
  const [modal, showModal] = useModal()
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    if (!sql) {
      return
    }
    const sqlite: DataSpace = (window as any).sqlite
    sqlite.exec2(sql).then((res: any) => {
      setRenderType(getQueryResultType(res))
      setRes(res)
    })
  }, [sql])

  const updateSql = (sql: string) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey) as SQLNode
      if ($isSQLNode(node)) {
        node.setSQL(sql)
      }
    })
  }

  const handleClick = () => {
    showModal("Insert SqlQuery", (onClose) => (
      <SqlQueryDialog
        activeEditor={editor}
        onClose={onClose}
        sql={sql}
        handleSqlChange={updateSql}
      />
    ))
  }

  return (
    <>
      {modal}
      {renderType === QueryResultType.TEXT && (
        <span
          className="inline-block cursor-pointer rounded-sm px-1 text-purple-500 hover:bg-secondary"
          onClick={handleClick}
        >
          {res[0]?.[Object.keys(res[0])[0]]}
        </span>
      )}
      {renderType === QueryResultType.CARD && (
        <Card data={res[0]} handleClick={handleClick} sql={sql} />
      )}
      {renderType === QueryResultType.LIST && (
        <List data={res} handleClick={handleClick} sql={sql} />
      )}
      {renderType === QueryResultType.TABLE && (
        <SqlTable data={res} handleClick={handleClick} sql={sql} />
      )}
    </>
  )
}