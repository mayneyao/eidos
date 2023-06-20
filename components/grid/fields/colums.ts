import { GridCellKind, GridColumnIcon } from "@glideapps/glide-data-grid"

export const defaultAllColumnsHandle = [
  {
    title: "Row ID",
    width: 120,
    icon: GridColumnIcon.HeaderRowID,
    hasMenu: false,
    kind: GridCellKind.RowID,
    getContent: (rawData: any) => {
      return {
        kind: GridCellKind.RowID,
        data: rawData,
        allowOverlay: true,
      }
    },
  },
  {
    title: "Protected",
    width: 120,
    icon: GridColumnIcon.HeaderCode,
    hasMenu: false,
    kind: GridCellKind.Protected,
    getContent: (rawData: any) => {
      return {
        kind: GridCellKind.Protected,
        data: rawData,
        allowOverlay: false,
      }
    },
  },
  {
    title: "Loading",
    width: 120,
    icon: GridColumnIcon.HeaderString,
    hasMenu: false,
    kind: GridCellKind.Loading,
    getContent: () => {
      return {
        kind: GridCellKind.Loading,
        allowOverlay: false,
      }
    },
  },
  {
    title: "Drilldown",
    width: 120,
    icon: GridColumnIcon.HeaderArray,
    hasMenu: false,
    kind: GridCellKind.Drilldown,
    getContent: (data: any[]) => {
      return {
        kind: GridCellKind.Drilldown,
        data: data,
        allowOverlay: true,
      }
    },
  },
]
