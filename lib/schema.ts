/**
 * Maps parsed gimme parameter types to TypeBox schemas for dynamic tool
 * registration. `string`/`number`/`boolean` map to their TypeBox counterparts
 * and `T[]` maps to `Type.Array(...)` of the element schema.
 */

import { Type, type TSchema } from "typebox";
import type { ParsedParam, ParamType } from "./parser.ts";

/** TypeBox schema for a single parsed parameter type. */
export function paramTypeToSchema(type: ParamType): TSchema {
  switch (type) {
    case "string":
      return Type.String();
    case "number":
      return Type.Number();
    case "boolean":
      return Type.Boolean();
    case "string[]":
      return Type.Array(Type.String());
    case "number[]":
      return Type.Array(Type.Number());
    case "boolean[]":
      return Type.Array(Type.Boolean());
  }
}

/** TypeBox object schema for a tool's full parameter list. */
export function paramsToObjectSchema(params: ParsedParam[]): TSchema {
  const properties: Record<string, TSchema> = {};
  for (const param of params) {
    properties[param.name] = paramTypeToSchema(param.type);
  }
  return Type.Object(properties);
}