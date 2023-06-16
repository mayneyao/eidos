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
    title: "Text",
    width: 120,
    icon: GridColumnIcon.HeaderString,
    hasMenu: false,
    kind: GridCellKind.Text,
    getContent: (data: string) => {
      return {
        kind: GridCellKind.Text,
        data: data,
        displayData: data,
        allowOverlay: true,
      }
    },
  },
  {
    title: "Number",
    width: 120,
    icon: GridColumnIcon.HeaderNumber,
    hasMenu: false,
    kind: GridCellKind.Number,
    getContent: (data: number) => {
      return {
        kind: GridCellKind.Number,
        data,
        displayData: `${data}`,
        allowOverlay: true,
      }
    },
  },
  {
    title: "Boolean",
    width: 120,
    icon: GridColumnIcon.HeaderBoolean,
    hasMenu: false,
    kind: GridCellKind.Boolean,
    getContent: (data: boolean | number) => {
      const checked = Boolean(data)
      return {
        kind: GridCellKind.Boolean,
        data: checked,
        allowOverlay: false,
        readonly: false,
      }
    },
  },
  {
    title: "Image",
    width: 120,
    icon: GridColumnIcon.HeaderImage,
    hasMenu: false,
    kind: GridCellKind.Image,
    getContent: (data: string) => {
      return {
        kind: GridCellKind.Image,
        data: data.split(","),
        allowOverlay: true,
        allowAdd: false,
        readonly: true,
      }
    },
  },
  {
    title: "Uri",
    width: 120,
    icon: GridColumnIcon.HeaderUri,
    hasMenu: false,
    kind: GridCellKind.Uri,
    getContent: (url: string) => {
      return {
        kind: GridCellKind.Uri,
        data: url,
        allowOverlay: true,
      }
    },
  },
  {
    title: "Markdown",
    width: 120,
    icon: GridColumnIcon.HeaderMarkdown,
    hasMenu: false,
    kind: GridCellKind.Markdown,
    getContent: (markdown: string) => {
      return {
        kind: GridCellKind.Markdown,
        data: markdown,
        allowOverlay: true,
      }
    },
  },
  {
    title: "Bubble",
    width: 120,
    icon: GridColumnIcon.HeaderArray,
    hasMenu: false,
    kind: GridCellKind.Bubble,
    getContent: (data: string) => {
      return {
        kind: GridCellKind.Bubble,
        data: data?.split(",") ?? [],
        allowOverlay: true,
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
