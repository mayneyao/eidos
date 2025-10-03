import { parseWithComments } from "pgsql-ast-parser";
import { FieldType } from "../fields/const";

/**
 * Parse column type mapping from SQL with comments
 * 
 * Supported comment formats:
 * -- [col_1:text]
 * -- [col_2:number]
 * -- [col_3:checkbox]
 * -- [col_4:url]
 * 
 * @param sql SQL statement with comments
 * @returns Column name to field type mapping object
 */
export function parseColumnTypesFromComments(sql: string): Record<string, FieldType> {
  const result = parseWithComments(sql);
  const columnTypeMap: Record<string, FieldType> = {};
  
  // Parse column type information from comments
  if (result.comments) {
    for (const comment of result.comments) {
      const commentText = comment.comment.trim();
      
      // Match format: -- [column_name:field_type] (supports inline comments)
      const match = commentText.match(/--\s*\[([^:]+):([^\]]+)\]/);
      
      if (match) {
        const columnName = match[1].trim();
        const fieldType = match[2].trim().toLowerCase();
        
        // Validate if field type is valid
        if (isValidFieldType(fieldType)) {
          columnTypeMap[columnName] = fieldType as FieldType;
        }
      }
    }
  }
  
  return columnTypeMap;
}

/**
 * Validate if field type is valid
 * @param type Field type string
 * @returns Whether the field type is valid
 */
function isValidFieldType(type: string): boolean {
  const validTypes = Object.values(FieldType);
  return validTypes.includes(type as FieldType);
}

/**
 * Extract column type information from SQL comments and return formatted results
 * 
 * @param sql SQL statement with comments
 * @returns Object containing column type mapping and parsing information
 */
export function extractColumnTypeInfo(sql: string): {
  columnTypes: Record<string, FieldType>;
  parsedComments: Array<{ text: string; start: number; end: number }>;
  invalidComments: Array<{ text: string; start: number; end: number; reason: string }>;
} {
  const result = parseWithComments(sql);
  const columnTypes: Record<string, FieldType> = {};
  const invalidComments: Array<{ text: string; start: number; end: number; reason: string }> = [];
  
  if (result.comments) {
    for (const comment of result.comments) {
      const commentText = comment.comment.trim();
      
      // Match format: -- [column_name:field_type] (supports inline comments)
      const match = commentText.match(/--\s*\[([^:]+):([^\]]+)\]/);
      
      if (match) {
        const columnName = match[1].trim();
        const fieldType = match[2].trim().toLowerCase();
        
        if (isValidFieldType(fieldType)) {
          columnTypes[columnName] = fieldType as FieldType;
        } else {
          invalidComments.push({
            text: commentText,
            start: comment._location?.start || 0,
            end: comment._location?.end || 0,
            reason: `Invalid field type: ${fieldType}`
          });
        }
      } else if (commentText.match(/--\s*\[/)) {
        // Incorrectly formatted comment
        invalidComments.push({
          text: commentText,
          start: comment._location?.start || 0,
          end: comment._location?.end || 0,
          reason: "Invalid format. Expected: -- [column_name:field_type]"
        });
      }
    }
  }
  
  return {
    columnTypes,
    parsedComments: result.comments?.map(c => ({
      text: c.comment,
      start: c._location?.start || 0,
      end: c._location?.end || 0
    })) || [],
    invalidComments
  };
}