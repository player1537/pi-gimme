/**
 * Compiles and runs a gimme signature's validation block.
 *
 * The block is compiled once at startup with `new Function(...paramNames, body)`
 * so a JavaScript syntax error surfaces as a startup error instead of failing
 * the first tool call. At call time the function runs synchronously with the
 * parsed argument values in scope; a throw means validation failed.
 */

import type { ParsedSignature } from "./parser.ts";

/** Thrown when a validation block is not valid JavaScript. */
export class ValidationCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationCompileError";
  }
}

/**
 * Compile a signature's validation block into a runnable function, or return
 * undefined when the signature has no validation block.
 *
 * @throws {ValidationCompileError} when the block is not valid JavaScript.
 */
export function compileValidation(
  signature: ParsedSignature,
): ((args: Record<string, unknown>) => void) | undefined {
  if (signature.validation === undefined || signature.validation.length === 0) {
    return undefined;
  }

  const paramNames = signature.params.map((param) => param.name);
  let fn: Function;
  try {
    fn = new Function(...paramNames, signature.validation);
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new ValidationCompileError(
        `Validation block for "${signature.name}" is not valid JavaScript: ${err.message}`,
      );
    }
    throw err;
  }

  return (args) => {
    fn(...paramNames.map((name) => args[name]));
  };
}