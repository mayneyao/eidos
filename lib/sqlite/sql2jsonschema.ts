import { Parser } from 'sql-ddl-to-json-schema'

const parser = new Parser('mysql');


export function sqlToJSONSchema2(sqlQuery: string) {
  return parser.feed(sqlQuery).toCompactJson()
}

/** tslint:disable */
export function sqlToJSONSchema(sqlQuery: string) {
  // 定义用于匹配 SQL 语句中表、列、类型和限制条件的正则表达式
  const patternTable = /^CREATE TABLE (\w+) (\(.+)/s;
  const patternColumn = /^  (\w+) (\w+)( .+)?,?$/gm;
  const patternPrimaryKey = /^  PRIMARY KEY \((.+)\),?$/gm;
  const patternForeignKey = /^  FOREIGN KEY \((\w+)\) REFERENCES (\w+)\((\w+)\),?$/gm;
  const patternCheck = /^  CHECK \((.+)\),?$/gm;
  const patternDefault = /^  DEFAULT (.+?),?$/gm;
  const patternNotNull = /^  NOT NULL,?$/gm;
  const patternUnique = /^  UNIQUE,?$/gm;

  // 解析 SQL 语句中的表和列信息，生成 JSON Schema 中的属性
  const matchTable = sqlQuery.trim().match(patternTable);
  if (!matchTable) {
    throw new Error('Invalid SQL query: missing CREATE TABLE statement');
  }
  const tableName = matchTable[1];
  const columnDefs = matchTable[2];

  const properties: any = {};
  const required = [];

  let matchColumn = patternColumn.exec(columnDefs);
  while (matchColumn) {
    const columnName = matchColumn[1];
    const columnType = matchColumn[2];
    let columnConstraints = matchColumn[3] || '';

    // 解析列的限制条件，生成 JSON Schema 中对应的关键字
    let isRequired = false;
    const enumValues: string | any[] = [];
    let minLength = undefined;
    let maxLength = undefined;
    let pattern = undefined;
    let isUnique = false;
    let defaultVal = undefined;
    let foreignKey = undefined;
    let check = undefined;

    let matchNotNull = patternNotNull.exec(columnConstraints);
    if (matchNotNull) {
      isRequired = true;
    }

    let matchDefault = patternDefault.exec(columnConstraints);
    if (matchDefault) {
      defaultVal = JSON.parse(matchDefault[1]);
    }

    let matchUnique = patternUnique.exec(columnConstraints);
    if (matchUnique) {
      isUnique = true;
    }

    let matchForeignKey = patternForeignKey.exec(columnConstraints);
    if (matchForeignKey) {
      foreignKey = {
        $ref: '#/definitions/' + matchForeignKey[2]
      };
    }

    let matchCheck = patternCheck.exec(columnConstraints);
    if (matchCheck) {
      check = matchCheck[1];
    }

    const propertyDef: any = {
      type: columnType.toLowerCase()
    };

    if (columnType === 'INTEGER' || columnType === 'NUMERIC') {
      if (isFinite(defaultVal)) {
        defaultVal = Number(defaultVal);
      } else {
        defaultVal = undefined;
      }
    }

    if (isRequired) {
      required.push(columnName);
    } else {
      propertyDef.nullable = true;
    }

    if (enumValues.length > 0) {
      propertyDef.enum = enumValues;
    }

    if (minLength !== undefined) {
      propertyDef.minLength = minLength;
    }

    if (maxLength !== undefined) {
      propertyDef.maxLength = maxLength;
    }

    if (pattern !== undefined) {
      propertyDef.pattern = pattern;
    }

    if (isUnique) {
      propertyDef.uniqueItems = true;
    }

    if (defaultVal !== undefined) {
      propertyDef.default = defaultVal;
    }

    if (foreignKey !== undefined) {
      propertyDef.$ref = foreignKey.$ref;
    }

    if (check !== undefined) {
      propertyDef.description = check;
    }

    properties[columnName] = propertyDef;

    matchColumn = patternColumn.exec(columnDefs);
  }

  // 处理主键
  let primaryKey: any = null;
  let matchPrimaryKey = patternPrimaryKey.exec(columnDefs);
  if (matchPrimaryKey) {
    const primaryKeyColumnNames = matchPrimaryKey[1].split(',').map(name => name.trim());
    primaryKey = {
      type: 'array',
      items: properties[primaryKeyColumnNames[0]]
    };
    if (primaryKeyColumnNames.length > 1) {
      primaryKey.uniqueItems = true;
    }
    required.push(...primaryKeyColumnNames);
  }

  // 处理外键
  const foreignKeys: string | any[] = [];
  let matchForeignKey = patternForeignKey.exec(columnDefs);
  while (matchForeignKey) {
    const columnName = matchForeignKey[1];
    const refTableName = matchForeignKey[2];
    const refColumnName = matchForeignKey[3];
    const foreignKey = {
      $ref: '#/definitions/' + refTableName,
      properties: {
        [refColumnName]: properties[refColumnName]
      }
    };
    properties[columnName] = foreignKey;
    matchForeignKey = patternForeignKey.exec(columnDefs);
  }

  // 定义表格对应的 JSON Schema
  const schema: any = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties,
    required
  };

  // 处理主键及外键
  if (primaryKey !== null) {
    schema.properties[tableName] = primaryKey;
    schema.required.push(tableName);
  }

  if (foreignKeys.length > 0) {
    schema.definitions = {};
    for (const fk of foreignKeys) {
      schema.definitions[fk.$ref.slice('#/definitions/'.length)] = fk;
    }
  }

  return schema;
}