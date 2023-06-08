import { initSql } from "@/components/grid/helper";
import { useSqlite } from "@/lib/sql";
import DataEditor, { EditableGridCell, GridCell, GridCellKind, GridColumn, Item } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { useTheme } from "next-themes";
import React, { useCallback, useEffect } from "react";
import { Button } from "../ui/button";
import { darkTheme } from "./theme";


const columns: GridColumn[] = [
  { id: "id", title: "id", width: 100 },
  { id: "name", title: "name", width: 100, },
  { id: "plugin_id", title: "plugin_id", width: 200 },
  { id: "comment_count", title: "comment_count", width: 100 },
  { id: "install_count", title: "install_count", width: 100 },
  { id: "like_count", title: "like_count", width: 100 },
  { id: "unique_run_count", title: "unique_run_count", width: 100 },
  { id: "view_count", title: "view_count", width: 100 },
  { id: "创建时间", title: "创建时间", width: 200 },
];

export default function Grid() {
  const sqlite = useSqlite();
  const { theme } = useTheme()
  const _theme = theme === "light" ? {} : darkTheme
  const [data, setData] = React.useState<any[]>([]);

  useEffect(() => {
    const getData = async () => {
      if (sqlite) {
        const result = await sqlite.sql`SELECT * FROM mytable2`;
        setData(result);
      }
    }
    getData();
  }, [sqlite])


  const getData = useCallback((cell: Item): GridCell => {
    const [columnIndex, rowIndex] = cell;
    const content = data[rowIndex]?.[columnIndex] ?? "";
    return {
      kind: GridCellKind.Text,
      allowOverlay: true,
      readonly: false,
      displayData: `${content}`,
      data: `${content}`,
    }
  }, [data])

  const initData = async () => {
    if (sqlite) {
      const result = await sqlite.sql`${initSql}`;
      console.log(result)
    }
  }

  const onCellEdited = React.useCallback(async (cell: Item, newValue: EditableGridCell) => {
    console.log('editor')
    if (newValue.kind !== GridCellKind.Text) {
      // we only have text cells, might as well just die here.
      return;
    }
    const [col, row] = cell;
    const indexes = columns.map((c) => c.title);
    const filedName = indexes[col];
    const rowId = data[row][0];
    if (sqlite) {
      const result = await sqlite.sql`UPDATE mytable2 SET ${filedName} = '${newValue.data}' WHERE id = ${rowId}`;
      // get new data
      const result2 = await sqlite.sql`SELECT ${filedName} FROM mytable2 where id = ${rowId}`;
      console.log(result, result2)
      // 
      data[row][col] = result2[0]
      setData([...data])
    }
  }, [data, sqlite]);

  return <div>
    <Button onClick={initData}>
      init Data
    </Button>
    <DataEditor
      theme={_theme}
      getCellContent={getData}
      columns={columns}
      rows={data.length}
      trailingRowOptions={{
        tint: true,
        sticky: true,
      }}
      onCellEdited={onCellEdited}
    />
    <div id="portal">

    </div>
  </div>

}