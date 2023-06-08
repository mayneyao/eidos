import { initSql } from "@/components/grid/helper";
import { useSqlite } from "@/lib/sql";
import DataEditor, { EditableGridCell, GridCell, GridCellKind, GridColumn, Item, Rectangle, GridSelection, CompactSelection, DataEditorProps } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { useTheme } from "next-themes";
import React, { useCallback, useEffect, useRef } from "react";
import { Button } from "../ui/button";
import { darkTheme } from "./theme";
import { useLayer } from "react-laag";
import { useSize } from 'ahooks';


const columns: GridColumn[] = [
  { hasMenu: true, id: "id", title: "id", width: 100 },
  { hasMenu: true, id: "name", title: "name", width: 100, },
  { hasMenu: true, id: "plugin_id", title: "plugin_id", width: 200 },
  { hasMenu: true, id: "comment_count", title: "comment_count", width: 100 },
  { hasMenu: true, id: "install_count", title: "install_count", width: 100 },
  { hasMenu: true, id: "like_count", title: "like_count", width: 100 },
  { hasMenu: true, id: "unique_run_count", title: "unique_run_count", width: 100 },
  { hasMenu: true, id: "view_count", title: "view_count", width: 100 },
  { hasMenu: true, id: "创建时间", title: "创建时间", width: 200 },
];
const defaultConfig: Partial<DataEditorProps> = {
  smoothScrollX: true,
  smoothScrollY: true,
  getCellsForSelection: true,
  width: "100%",
  freezeColumns: 1
}

export default function Grid() {
  const sqlite = useSqlite();
  const { theme } = useTheme()
  const _theme = theme === "light" ? {} : darkTheme
  const [data, setData] = React.useState<any[]>([]);
  const ref = useRef(null);
  const size = useSize(ref);
  const [showMenu, setShowMenu] = React.useState<{ bounds: Rectangle; col: number }>();
  const [selection, setSelection] = React.useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const onHeaderMenuClick = React.useCallback((col: number, bounds: Rectangle) => {
    setShowMenu({ col, bounds });
  }, []);

  const { renderLayer, layerProps } = useLayer({
    isOpen: showMenu !== undefined,
    triggerOffset: 4,
    onOutsideClick: () => setShowMenu(undefined),
    trigger: {
      getBounds: () => {
        const res = {
          bottom: (showMenu?.bounds.y ?? 0) + (showMenu?.bounds.height ?? 0),
          height: showMenu?.bounds.height ?? 0,
          left: showMenu?.bounds.x ?? 0,
          right: (showMenu?.bounds.x ?? 0) + (showMenu?.bounds.width ?? 0),
          top: showMenu?.bounds.y ?? 0,
          width: showMenu?.bounds.width ?? 0,
        }
        console.log(res)
        return res;
      },
    },
    placement: "bottom-start",
    auto: true,
    possiblePlacements: ["bottom-start", "bottom-end"],
  });


  useEffect(() => {
    const getData = async () => {
      if (sqlite) {
        console.log(sqlite)
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

  return <div className="h-full p-8" ref={ref}>
    <Button onClick={initData} className="hidden">
      init Data
    </Button>
    <>
      <DataEditor
        {...defaultConfig}
        theme={_theme}
        onHeaderMenuClick={onHeaderMenuClick}
        onCellContextMenu={(cell) => {
          console.log(cell)
        }}
        gridSelection={selection}
        onGridSelectionChange={setSelection}
        getCellContent={getData}
        columns={columns}
        rows={data.length}
        trailingRowOptions={{
          tint: true,
          sticky: true,
        }}
        onCellEdited={onCellEdited}
      />
      {showMenu !== undefined &&
        renderLayer(
          <div
            {...layerProps}
            style={{
              ...layerProps.style,
              width: 300,
              padding: 4,
              borderRadius: 8,
              backgroundColor: "white",
              border: "1px solid black",
            }}>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
              <li>Item 3</li>
            </ul>
          </div>
        )}
    </>
    <div id="portal" />
  </div>
}