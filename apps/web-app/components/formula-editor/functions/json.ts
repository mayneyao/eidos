/**
 * SQLite JSON Functions Reference
 *
 * This module documents the JSON functions available in SQLite 3.38.0 and later.
 * All functions accept both JSON text and JSONB (binary JSON) format unless otherwise noted.
 */

/**
 * Core JSON Functions
 */
export const JSON_FUNCTIONS = {
  // Validation & Formatting
  json: {
    description: "Verifies and minifies JSON, removing unnecessary whitespace",
    example: `json(' { "this" : "is", "a": ["test"] } ') → '{"this":"is","a":["test"]}'`,
  },

  jsonb: {
    description:
      "Converts JSON to SQLite's binary JSONB format for better performance",
    example: "jsonb('{\"x\":35}') → <binary JSONB data>",
  },

  json_pretty: {
    description:
      "Formats JSON with indentation for readability. Second argument specifies indent string (default: 4 spaces)",
    example: "json_pretty('{\"a\":1}', '  ') → '{\n  \"a\": 1\n}'",
  },

  json_valid: {
    description:
      "Checks if input is valid JSON. Second argument is bitmask: 1=RFC-8259, 2=JSON5, 4=JSONB, 8=strict JSONB",
    example: "json_valid('{\"x\":35}') → 1",
  },

  json_error_position: {
    description:
      "Returns position of first syntax error (1-based), or 0 if valid",
    example: "json_error_position('{bad json}') → 2",
  },

  // Array & Object Construction
  json_array: {
    description: "Creates JSON array from arguments",
    example: "json_array(1,2,'3',4) → '[1,2,\"3\",4]'",
  },

  json_object: {
    description: "Creates JSON object from key-value pairs",
    example: "json_object('a',2,'c',4) → '{\"a\":2,\"c\":4}'",
  },

  // Extraction & Type Info
  json_extract: {
    description:
      "Extracts values using JSON paths. Multiple paths return JSON array",
    example: `json_extract('{"a":2,"c":[4,5]}', '$.c[1]') → 5`,
  },

  json_type: {
    description:
      "Returns type of JSON value: null, true, false, integer, real, text, array, or object",
    example: `json_type('{"a":[2,3.5,true]}', '$.a[1]') → 'real'`,
  },

  // Modification
  json_insert: {
    description: "Inserts values at paths if they don't exist",
    example: `json_insert('{"a":2}', '$.b', 5) → '{"a":2,"b":5}'`,
  },

  json_replace: {
    description: "Replaces existing values at paths, ignores missing paths",
    example: `json_replace('{"a":2}', '$.a', 5) → '{"a":5}'`,
  },

  json_set: {
    description: "Sets values at paths, creating paths if needed",
    example: `json_set('{"a":2}', '$.b', 5) → '{"a":2,"b":5}'`,
  },

  json_patch: {
    description: "Applies RFC-7396 MergePatch to modify JSON",
    example: `json_patch('{"a":1,"b":2}', '{"a":null,"c":3}') → '{"b":2,"c":3}'`,
  },

  json_remove: {
    description: "Removes elements at specified paths",
    example: `json_remove('{"a":2,"b":5}', '$.b') → '{"a":2}'`,
  },

  // Array Operations
  json_array_length: {
    description: "Returns length of JSON array",
    example: `json_array_length('[1,2,3,4]') → 4`,
  },

  // Aggregation
  json_group_array: {
    description: "Aggregate function that combines values into JSON array",
    example: "SELECT json_group_array(value) FROM table",
  },

  json_group_object: {
    description:
      "Aggregate function that combines key-value pairs into JSON object",
    example: "SELECT json_group_object(key, value) FROM table",
  },
}

/**
 * JSON Path Operators
 */
export const JSON_OPERATORS = {
  "->": {
    description: "Extracts JSON value at path, returns as JSON",
    example: `'{"a":2}' -> '$.a' → '2'`,
  },

  "->>": {
    description: "Extracts value at path, returns as SQL value",
    example: `'{"a":2}' ->> '$.a' → 2`,
  },
}

/**
 * JSON Path Syntax
 *
 * Paths start with '$' followed by:
 * - .key - Object property access
 * - [n] - Array index access (0-based)
 * - [#-n] - Array index from end (1-based)
 * - [#] - Array append position
 *
 * Examples:
 * $.name
 * $.addresses[0]
 * $.addresses[#-1]  // Last element
 * $.items[#]        // Append position
 */
