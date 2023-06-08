// export declare enum GridCellKind {
//   Uri = "uri",
//   Text = "text",
//   Image = "image",
//   RowID = "row-id",
//   Number = "number",
//   Bubble = "bubble",
//   Boolean = "boolean",
//   Loading = "loading",
//   Markdown = "markdown",
//   Drilldown = "drilldown",
//   Protected = "protected",
//   Custom = "custom"
// }

import { GridCellKind } from "@glideapps/glide-data-grid";

export const guessCellKind = (value: any) => {

  const valueType = typeof value;
  switch (valueType) {
    case "string":
      if (value.startsWith("http")) {
        return GridCellKind.Uri;
      }
      return GridCellKind.Text;
    case "number":
      return GridCellKind.Number;
    case "boolean":
      return GridCellKind.Boolean;
    case "object":
      return GridCellKind.Text;
    default:
      return GridCellKind.Text;
  }
}