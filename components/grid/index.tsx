import { initSql, tableInterface2GridColumn } from "@/components/grid/helper";
import { useSqlite, useTable } from "@/lib/sql";
import DataEditor, {
  CompactSelection, DataEditorProps, EditableGridCell,
  GridCell, GridCellKind, GridSelection, Item, Rectangle
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { useTheme } from "next-themes";
import React, { useCallback, useRef } from "react";
import { useLayer } from "react-laag";
import { Button } from "../ui/button";
import { darkTheme } from "./theme";
import { useClickAway } from 'ahooks';
import { useTableAppStore } from "./store";
import { cn } from "@/lib/utils";
import { FieldAppendPanel } from "./field-append-panel";


const defaultConfig: Partial<DataEditorProps> = {
  smoothScrollX: true,
  smoothScrollY: true,
  getCellsForSelection: true,
  width: "100%",
  freezeColumns: 1
}


interface IGridProps {
  tableName: string
}
export default function Grid(props: IGridProps) {
  const { tableName } = props;
  const { sqlite } = useSqlite();
  const { theme } = useTheme()
  const _theme = theme === "light" ? {} : darkTheme
  const { data, setData, schema, updateCell, addField, addRow } = useTable(tableName)
  const columns = tableInterface2GridColumn(schema[0]);
  const [showMenu, setShowMenu] = React.useState<{ bounds: Rectangle; col: number }>();
  const [selection, setSelection] = React.useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const onHeaderMenuClick = React.useCallback((col: number, bounds: Rectangle) => {
    setShowMenu({ col, bounds });
  }, []);

  const { isAddFieldEditorOpen, setIsAddFieldEditorOpen } = useTableAppStore();
  const ref = useRef<HTMLDivElement>(null);
  useClickAway(() => {
    isAddFieldEditorOpen && setIsAddFieldEditorOpen(false)
  }, ref);


  const onHeaderClicked = React.useCallback(() => {
    console.log("Header clicked");
  }, []);

  const isOpen = showMenu !== undefined;

  const { renderLayer, layerProps } = useLayer({
    isOpen,
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


  // const tableSchema = useTableSchema('mytable3')

  const getData = useCallback((cell: Item): GridCell => {
    const [columnIndex, rowIndex] = cell;
    const content = data[rowIndex]?.[columnIndex] ?? "";
    const field = columns[columnIndex]
    let readonly = false;
    if (field.title === '_id') {
      readonly = true;
    }
    return {
      kind: GridCellKind.Text,
      allowOverlay: true,
      readonly,
      displayData: `${content}`,
      data: `${content}`,
    }
  }, [data, columns])

  const initData = async () => {
    if (sqlite) {
      const result = await sqlite.sql`${initSql}`;
      console.log(result)
    }
  }

  const onCellEdited = React.useCallback(async (cell: Item, newValue: EditableGridCell) => {
    if (newValue.kind !== GridCellKind.Text) {
      // we only have text cells, might as well just die here.
      return;
    }
    if (!columns) return;
    updateCell(cell[0], cell[1], newValue.data)
  }, [columns, updateCell]);

  return <div className="h-full p-8">
    <Button onClick={initData} className="hidden">
      init Data
    </Button>

    <div className="flex h-full">
      {
        columns.length ? <DataEditor
          {...defaultConfig}
          theme={_theme}
          onHeaderMenuClick={onHeaderMenuClick}
          onCellContextMenu={(_, e) => e.preventDefault()}
          gridSelection={selection}
          onGridSelectionChange={setSelection}
          getCellContent={getData}
          columns={columns ?? []}
          rows={data.length}
          trailingRowOptions={{
            tint: true,
            sticky: true,
          }}
          rightElement={
            <Button variant="ghost" onClick={() => {
              setIsAddFieldEditorOpen(true)
              addField(`newField${columns.length + 1}`, 'text')
            }}>
              +
            </Button>
          }
          rightElementProps={{
            sticky: true,
            fill: true,
          }}
          onCellEdited={onCellEdited}
          onRowAppended={() => {
            addRow()
          }}
        /> : <div>
          select a table
        </div>
      }
      {
        isAddFieldEditorOpen && <div ref={ref} className={cn(
          "fixed right-0 z-50 h-screen w-[400px] bg-white shadow-lg"
        )}>
          <FieldAppendPanel />
        </div>
      }
    </div>

    <div id="portal" />
    {
      isOpen && renderLayer(
        <div
          {...layerProps}
          className={isOpen ? "block" : "hidden"}
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
  </div>
}