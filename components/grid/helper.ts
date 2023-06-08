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

import { TableInterface } from 'sql-ddl-to-json-schema'

import { GridCellKind, GridColumn } from "@glideapps/glide-data-grid";



export const tableInterface2GridColumn = (table?: TableInterface): GridColumn[] => {
  return table?.columns?.map((column) => {
    return {
      id: column.name,
      title: column.name,
      with: 150,
      hasMenu: true,
    }
  }) ?? []
}

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


export const createTemplateTableSql = (tableName: string) => {
  const templateTableSql = `
CREATE TABLE ${tableName} (
  _id VARCHAR(32) PRIMARY KEY NOT NULL,
  id               INTEGER  NULL
  ,name             VARCHAR(100)  NULL
  ,plugin_id        VARCHAR(32)  NULL
  ,comment_count    BIT   NULL
);
INSERT INTO ${tableName}(_id,name,id,plugin_id,comment_count) VALUES ('1','Plato',1,'1220625048523881652',1);
INSERT INTO ${tableName}(_id,name,id,plugin_id,comment_count) VALUES ('2','Plato',2,'1220625048523881652',1);
INSERT INTO ${tableName}(_id,name,id,plugin_id,comment_count) VALUES ('3','Plato',3,'1220625048523881652',1);
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