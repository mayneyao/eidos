import { tableInterface2GridColumn } from "@/components/grid/helper";
import { useTable } from "@/lib/sql";
import { cn } from "@/lib/utils";
import DataEditor, {
  DataEditorProps, EditableGridCell,
  GridCell, GridCellKind,
  Item
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { useClickAway } from 'ahooks';
import { useTheme } from "next-themes";
import React, { useCallback, useRef } from "react";
import { Button } from "../ui/button";
import { FieldAppendPanel } from "./field-append-panel";
import { ContextMenuDemo } from "./grid-context-menu";
import { useTableAppStore } from "./store";
import { darkTheme } from "./theme";


const defaultConfig: Partial<DataEditorProps> = {
  smoothScrollX: true,
  smoothScrollY: true,
  getCellsForSelection: true,
  width: "100%",
  freezeColumns: 1
}


interface IGridProps {
  tableName: string
  databaseName: string
}


export default function Grid(props: IGridProps) {
  const { tableName, databaseName } = props;
  const { theme } = useTheme()
  const _theme = theme === "light" ? {} : darkTheme
  const { data, schema, updateCell, addField, addRow, deleteRows } = useTable(tableName, databaseName)
  const columns = tableInterface2GridColumn(schema[0]);
  const { isAddFieldEditorOpen, setIsAddFieldEditorOpen, selection, setSelection } = useTableAppStore();
  const ref = useRef<HTMLDivElement>(null);
  useClickAway(() => {
    isAddFieldEditorOpen && setIsAddFieldEditorOpen(false)
  }, ref);


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

  const onCellEdited = React.useCallback(async (cell: Item, newValue: EditableGridCell) => {
    if (newValue.kind !== GridCellKind.Text) {
      // we only have text cells, might as well just die here.
      return;
    }
    if (!columns) return;
    updateCell(cell[0], cell[1], newValue.data)
  }, [columns, updateCell]);

  return <div className="h-full p-8">
    <div className="flex h-full">
      <ContextMenuDemo deleteRows={deleteRows}>
        <DataEditor
          {...defaultConfig}
          theme={_theme}
          // onCellContextMenu={(_, e) => e.preventDefault()}
          gridSelection={selection}
          onGridSelectionChange={setSelection}
          getCellContent={getData}
          fillHandle={true}
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
        />
      </ContextMenuDemo>
      {
        isAddFieldEditorOpen && <div ref={ref} className={cn(
          "fixed right-0 z-50 h-screen w-[400px] bg-white shadow-lg"
        )}>
          <FieldAppendPanel />
        </div>
      }
    </div>

    <div id="portal" />
  </div>
}