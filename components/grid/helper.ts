import { GridCellKind, GridColumn } from "@glideapps/glide-data-grid"
import Papa from "papaparse"
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

import { TableInterface } from "sql-ddl-to-json-schema"
import { v4 as uuidv4 } from "uuid"

const typeIconMap: any = {
  varchar: "headerString",
  int: "headerNumber",
}

export const tableInterface2GridColumn = (
  table?: TableInterface
): GridColumn[] => {
  return (
    table?.columns?.map((column) => {
      return {
        id: column.name,
        title: column.name,
        with: 200,
        // hasMenu: true,
        icon: typeIconMap[column.type.datatype] ?? "headerString",
        type: column.type.datatype,
      }
    }) ?? []
  )
}

export const guessCellKind = (value: any) => {
  const valueType = typeof value
  switch (valueType) {
    case "string":
      if (value.startsWith("http")) {
        return GridCellKind.Uri
      }
      return GridCellKind.Text
    case "number":
      return GridCellKind.Number
    case "boolean":
      return GridCellKind.Boolean
    case "object":
      return GridCellKind.Text
    default:
      return GridCellKind.Text
  }
}

export const createTableWithSql = (tableName: string, sql: string) => {
  const createTableSql = `
CREATE TABLE ${tableName} (
  _id VARCHAR(32) PRIMARY KEY NOT NULL
  ,no             INTEGER  NULL
  ,title             VARCHAR(100)  NULL
);

${sql}
`
}

export const createTemplateTableSql = (tableName: string) => {
  const templateTableSql = `
CREATE TABLE ${tableName} (
  _id VARCHAR(32) PRIMARY KEY NOT NULL
  ,no             INTEGER  NULL
  ,title             VARCHAR(100)  NULL
);
INSERT INTO ${tableName}(_id,no,title) VALUES ('${uuidv4()}',1,'foo');
INSERT INTO ${tableName}(_id,no,title) VALUES ('${uuidv4()}',2,'bar');
INSERT INTO ${tableName}(_id,no,title) VALUES ('${uuidv4()}',3,'baz');
`
  return templateTableSql
}

export const initSql = `
CREATE TABLE mytable3(
  id               INTEGER  NOT NULL PRIMARY KEY
 ,name             VARCHAR(5) NOT NULL 
 ,plugin_id        VARCHAR(19) NOT NULL
 ,comment_count    BIT  NOT NULL
 ,install_count    INTEGER  NOT NULL
 ,like_count       INTEGER  NOT NULL
 ,unique_run_count INTEGER  NOT NULL
 ,view_count       INTEGER  NOT NULL
 ,create_at             VARCHAR(19) NOT NULL
);
INSERT INTO mytable3(name,id,plugin_id,comment_count,install_count,like_count,unique_run_count,view_count,create_at) VALUES ('Plato',1,'1220625048523881652',1,0,8,35,122,'2023/03/29 06:05 早上');
INSERT INTO mytable3(name,id,plugin_id,comment_count,install_count,like_count,unique_run_count,view_count,create_at) VALUES ('Plato',2,'1220625048523881652',1,0,8,39,142,'2023/03/29 08:30 晚上');
INSERT INTO mytable3(name,id,plugin_id,comment_count,install_count,like_count,unique_run_count,view_count,create_at) VALUES ('Plato',3,'1220625048523881652',1,0,8,45,163,'2023/03/30 02:55 下午');
INSERT INTO mytable3(name,id,plugin_id,comment_count,install_count,like_count,unique_run_count,view_count,create_at) VALUES ('Plato',4,'1220625048523881652',1,0,9,49,174,'2023/03/30 08:29 晚上');
INSERT INTO mytable3(name,id,plugin_id,comment_count,install_count,like_count,unique_run_count,view_count,create_at) VALUES ('Plato',5,'1220625048523881652',1,0,10,58,213,'2023/03/31 08:30 晚上');
INSERT INTO mytable3(name,id,plugin_id,comment_count,install_count,like_count,unique_run_count,view_count,create_at) VALUES ('Plato',6,'1220625048523881652',1,1,10,63,236,'2023/04/01 08:30 晚上');
INSERT INTO mytable3(name,id,plugin_id,comment_count,install_count,like_count,unique_run_count,view_count,create_at) VALUES ('Plato',7,'1220625048523881652',1,1,10,68,257,'2023/04/02 08:30 晚上');
INSERT INTO mytable3(name,id,plugin_id,comment_count,install_count,like_count,unique_run_count,view_count,create_at) VALUES ('Plato',8,'1220625048523881652',1,1,11,69,273,'2023/04/03 08:29 晚上');
`
