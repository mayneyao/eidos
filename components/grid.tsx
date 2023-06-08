import "@glideapps/glide-data-grid/dist/index.css";
import React, { useCallback, useEffect } from "react";
import DataEditor, { GridCell, GridCellKind, GridColumn, Item } from "@glideapps/glide-data-grid";
import { useSqlite } from "@/lib/sql";
import { guessCellKind } from "@/lib/grid";

export default function Grid() {
  const sqlite = useSqlite();
  const [data, setData] = React.useState<any[]>([]);

  useEffect(() => {
    const getData = async () => {
      if (sqlite) {
        const result = await sqlite.sql`SELECT * FROM mytable1`;
        setData(result);
      }
    }
    getData();
  }, [sqlite])

  const columns: GridColumn[] = [
    // name,id,comment_count,install_count,like_count,unique_run_count,view_count,创建时间
    { title: "Name", width: 100 },
    { title: "ID", width: 100 },
    { title: "Comment Count", width: 100 },
    { title: "Install Count", width: 100 },
    { title: "Like Count", width: 100 },
    { title: "Unique Run Count", width: 100 },
    { title: "View Count", width: 100 },
    { title: "Create Time", width: 100 },
  ];

  const getData = useCallback((cell: Item): GridCell => {
    const [columnIndex, rowIndex] = cell;
    const content = data[rowIndex]?.[columnIndex] ?? "";
    return {
      kind: guessCellKind(content),
      allowOverlay: false,
      displayData: `${content}`,
      data: content,
    }
  }, [data])
  return <DataEditor getCellContent={getData} columns={columns} rows={data.length} />;
}