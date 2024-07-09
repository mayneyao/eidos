/**
 * 1. add new column with new type
 * 2. copy data from old column to new column
 * 3. rename old column to old column + "_old"
 * 4. rename new column to old column
 * 5. drop old column
 * @param tableName
 * @param columnName
 * @param newType
 */
export const alterColumnType = (
  tableName: string,
  columnName: string,
  newType: "TEXT" | "REAL" | "INT"
) => {
  return `
        ALTER TABLE ${tableName} ADD COLUMN ${columnName}_new ${newType};
        UPDATE ${tableName} SET ${columnName}_new = ${columnName};
        ALTER TABLE ${tableName} RENAME COLUMN ${columnName} TO ${columnName}_old;
        ALTER TABLE ${tableName} RENAME COLUMN ${columnName}_new TO ${columnName};
        ALTER TABLE ${tableName} DROP COLUMN ${columnName}_old;

    `
}
