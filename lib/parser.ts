/**
 * Hand-written parser for the gimme signature grammar:
 *
 *   name(param: type, ...) [ { validation } ]
 *
 * Supported parameter types are `string`, `number`, `boolean`, and `T[]` (an
 * array of any supported scalar). Nested objects and optional parameters are
 * rejected with specific messages, as is the reserved tool name `_error`.
 */

export type ScalarType = "string" | "number" | "boolean";
export type ParamType = ScalarType | `${ScalarType}[]`;

export interface ParsedParam {
  name: string;
  type: ParamType;
}

export interface ParsedSignature {
  name: string;
  params: ParsedParam[];
  /** The validation block body (between the braces), or undefined when absent. */
  validation?: string;
}

/** Thrown when a signature does not match the grammar. */
export class SignatureParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignatureParseError";
  }
}

const SCALAR_TYPES: ReadonlySet<string> = new Set(["string", "number", "boolean"]);
const RESERVED_TOOL_NAMES: ReadonlySet<string> = new Set(["_error"]);
const TOOL_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const PARAM_NAME_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function parseSignature(input: string): ParsedSignature {
  const source = input.trim();
  if (source.length === 0) {
    throw new SignatureParseError("Signature is empty");
  }

  const openParen = source.indexOf("(");
  if (openParen < 0) {
    throw new SignatureParseError(
      `Malformed signature "${source}": expected "name(param: type, ...)"`,
    );
  }

  const name = source.slice(0, openParen).trim();
  if (!TOOL_NAME_RE.test(name)) {
    throw new SignatureParseError(`Malformed signature "${source}": "${name}" is not a valid tool name`);
  }
  if (RESERVED_TOOL_NAMES.has(name)) {
    throw new SignatureParseError(`"${name}" is a reserved tool name`);
  }

  const closeParen = findMatchingParen(source, openParen);
  if (closeParen < 0) {
    throw new SignatureParseError(`Malformed signature "${source}": missing ")" after the parameter list`);
  }

  const paramsText = source.slice(openParen + 1, closeParen).trim();
  const params = paramsText.length === 0
    ? []
    : splitTopLevel(paramsText, ",").map(parseParam);

  const rest = source.slice(closeParen + 1).trim();
  let validation: string | undefined;
  if (rest.length > 0) {
    if (!rest.startsWith("{")) {
      throw new SignatureParseError(
        `Malformed signature "${source}": unexpected "${rest[0]}" after the parameter list`,
      );
    }
    const end = findMatchingBrace(rest, 0);
    if (end < 0) {
      throw new SignatureParseError(`Malformed signature "${source}": unclosed validation block`);
    }
    validation = rest.slice(1, end).trim();
    const after = rest.slice(end + 1).trim();
    if (after.length > 0) {
      throw new SignatureParseError(
        `Malformed signature "${source}": unexpected "${after[0]}" after the validation block`,
      );
    }
  }

  return { name, params, validation };
}

function parseParam(text: string): ParsedParam {
  const param = text.trim();
  if (param.length === 0) {
    throw new SignatureParseError(`Malformed signature: empty parameter`);
  }
  if (param.includes("?")) {
    throw new SignatureParseError(`Optional parameters are not supported: "${param}"`);
  }

  const colon = param.indexOf(":");
  if (colon < 0) {
    throw new SignatureParseError(`Malformed parameter "${param}": expected "name: type"`);
  }

  const name = param.slice(0, colon).trim();
  if (!PARAM_NAME_RE.test(name)) {
    throw new SignatureParseError(`Malformed parameter "${param}": "${name}" is not a valid parameter name`);
  }

  const typeText = param.slice(colon + 1).trim();
  if (typeText.includes("{") || typeText.includes("}")) {
    throw new SignatureParseError(`Nested objects are not supported: "${param}"`);
  }

  return { name, type: parseType(typeText, param) };
}

function parseType(typeText: string, param: string): ParamType {
  if (typeText.endsWith("[]")) {
    const scalar = typeText.slice(0, -2);
    if (SCALAR_TYPES.has(scalar)) {
      return `${scalar}[]` as ParamType;
    }
    throw new SignatureParseError(
      `Unsupported type "${typeText}" in parameter "${param}": expected string, number, boolean, or an array of one of those`,
    );
  }
  if (SCALAR_TYPES.has(typeText)) {
    return typeText as ParamType;
  }
  throw new SignatureParseError(
    `Unsupported type "${typeText}" in parameter "${param}": expected string, number, boolean, or an array of one of those`,
  );
}

/** Index of the `)` matching the `(` at `openParen`, or -1 when unbalanced. */
function findMatchingParen(source: string, openParen: number): number {
  let depth = 0;
  for (let i = openParen; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split on `separator` at brace/bracket/paren depth zero. */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{" || ch === "[" || ch === "(") depth += 1;
    else if (ch === "}" || ch === "]" || ch === ")") depth -= 1;
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Index of the `}` matching the `{` at `start`, or -1 when unbalanced.
 * Skips string literals, template literals (including `${...}`), and comments
 * so validation blocks containing braces in strings do not confuse the scan.
 */
function findMatchingBrace(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipString(text, i) - 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      const newline = text.indexOf("\n", i);
      if (newline < 0) return -1;
      i = newline;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) return -1;
      i = end + 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Index just past the string/template literal starting at `start`. */
function skipString(text: string, start: number): number {
  const quote = text[start];
  for (let i = start + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === quote) return i + 1;
    if (quote === "`" && ch === "$" && text[i + 1] === "{") {
      // Skip the ${...} expression, tracking nested braces.
      let depth = 1;
      i += 2;
      while (i < text.length && depth > 0) {
        const inner = text[i];
        if (inner === "'" || inner === '"' || inner === "`") {
          i = skipString(text, i) - 1;
        } else if (inner === "{") {
          depth += 1;
        } else if (inner === "}") {
          depth -= 1;
        }
        i += 1;
      }
    }
  }
  return text.length;
}