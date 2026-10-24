import { test } from "node:test";
import assert from "node:assert/strict";
import { compileValidation, ValidationCompileError } from "../lib/validate.ts";
import { parseSignature } from "../lib/parser.ts";

test("validation passes when the block does not throw", () => {
  const signature = parseSignature(
    "gimme(title: string) { if (title.length < 3) throw new Error(\"too short\"); }",
  );
  const validate = compileValidation(signature);
  assert.ok(validate);
  assert.doesNotThrow(() => validate({ title: "hello" }));
});

test("validation throws when the block throws", () => {
  const signature = parseSignature(
    "gimme(title: string) { if (title.length < 3) throw new Error(\"too short\"); }",
  );
  const validate = compileValidation(signature);
  assert.throws(() => validate({ title: "ab" }), /too short/);
});

test("arguments are in scope as variables", () => {
  const signature = parseSignature(
    "gimme(count: number, tags: string[]) { if (count !== tags.length) throw new Error(\"count mismatch\"); }",
  );
  const validate = compileValidation(signature);
  assert.doesNotThrow(() => validate({ count: 2, tags: ["a", "b"] }));
  assert.throws(() => validate({ count: 1, tags: ["a", "b"] }), /count mismatch/);
});

test("validation can return a value without affecting pass/fail", () => {
  const signature = parseSignature("gimme(x: number) { return x * 2; }");
  const validate = compileValidation(signature);
  assert.doesNotThrow(() => validate({ x: 21 }));
});

test("returns undefined when the signature has no validation block", () => {
  const signature = parseSignature("gimme(title: string)");
  assert.equal(compileValidation(signature), undefined);
});

test("syntax errors surface as a compile error naming the tool", () => {
  const signature = parseSignature("gimme(title: string) { if (title.length < 3 }");
  assert.throws(() => compileValidation(signature), (err) => {
    assert.ok(err instanceof ValidationCompileError);
    assert.match(err.message, /Validation block for "gimme" is not valid JavaScript/);
    return true;
  });
});

test("syntax errors are not ValidationCompileError for non-syntax failures", () => {
  // A block that is valid JS but references an undefined identifier compiles
  // fine; only the call throws.
  const signature = parseSignature("gimme(x: number) { missingIdentifier(x); }");
  const validate = compileValidation(signature);
  assert.ok(validate);
  assert.throws(() => validate({ x: 1 }), ReferenceError);
});