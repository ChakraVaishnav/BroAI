/**
 * Shared JSON Schema → Zod shape converter
 * Used by both mcpClient.js (agent side) and mcp_server/index.js (server side)
 * to avoid duplicated schema parsing logic.
 */
import { z } from "zod";

/**
 * Converts a JSON Schema object's properties into a plain Zod shape record.
 * Returns the raw shape (not wrapped in z.object) so callers can compose it.
 */
export function buildZodShape(schema = {}) {
  if (!schema || schema.type !== "object") {
    return {};
  }

  const properties = schema.properties || {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const shape = {};

  for (const [key, fieldSchema] of Object.entries(properties)) {
    let field;

    switch (fieldSchema?.type) {
      case "number":
        field = z.number();
        break;
      case "integer":
        field = z.number().int();
        break;
      case "boolean":
        field = z.boolean();
        break;
      case "array":
        field = z.array(z.any());
        break;
      case "object":
        field = z.record(z.any());
        break;
      case "string":
      default:
        field = z.string();
        break;
    }

    if (fieldSchema?.description) {
      field = field.describe(fieldSchema.description);
    }

    if (!required.has(key)) {
      field = field.optional();
    }

    shape[key] = field;
  }

  return shape;
}
