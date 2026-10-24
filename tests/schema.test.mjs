import { test } from "node:test";
import assert from "node:assert/strict";
import { Compile } from "typebox/compile";
import { paramsToObjectSchema, paramTypeToSchema } from "../lib/schema.ts";
import { parseSignature } from "../lib/parser.ts";

function check(schema, value) {
  return Compile(schema).Check(value);
}

test("string parameter accepts strings and rejects non-strings", () => {
  const schema = paramTypeToSchema("string");
  assert.equal(check(schema, "hello"), true);
  assert.equal(check(schema, 42), false);
  assert.equal(check(schema, true), false);
  assert.equal(check(schema, ["a"]), false);
});

test("number parameter accepts numbers and rejects non-numbers", () => {
  const schema = paramTypeToSchema("number");
  assert.equal(check(schema, 42), true);
  assert.equal(check(schema, 0), true);
  assert.equal(check(schema, "42"), false);
  assert.equal(check(schema, true), false);
});

test("boolean parameter accepts booleans and rejects non-booleans", () => {
  const schema = paramTypeToSchema("boolean");
  assert.equal(check(schema, true), true);
  assert.equal(check(schema, false), true);
  assert.equal(check(schema, 1), false);
  assert.equal(check(schema, "true"), false);
});

test("array parameter accepts arrays of the element type and rejects others", () => {
  const strings = paramTypeToSchema("string[]");
  assert.equal(check(strings, ["a", "b"]), true);
  assert.equal(check(strings, []), true);
  assert.equal(check(strings, "a"), false);
  assert.equal(check(strings, [1]), false);

  const numbers = paramTypeToSchema("number[]");
  assert.equal(check(numbers, [1, 2]), true);
  assert.equal(check(numbers, ["1"]), false);

  const booleans = paramTypeToSchema("boolean[]");
  assert.equal(check(booleans, [true, false]), true);
  assert.equal(check(booleans, [1]), false);
});

test("object schema matches the declared signature shape", () => {
  const parsed = parseSignature("gimme(title: string, count: number, done: boolean)");
  const schema = paramsToObjectSchema(parsed.params);
  assert.equal(check(schema, { title: "x", count: 3, done: true }), true);
  assert.equal(check(schema, { title: "x", count: "3", done: true }), false);
  assert.equal(check(schema, { title: "x", count: 3 }), false);
  assert.equal(check(schema, { title: 1, count: 3, done: true }), false);
});

test("object schema rejects mismatched array shapes", () => {
  const parsed = parseSignature("gimme(tags: string[])");
  const schema = paramsToObjectSchema(parsed.params);
  assert.equal(check(schema, { tags: ["a"] }), true);
  assert.equal(check(schema, { tags: "a" }), false);
  assert.equal(check(schema, { tags: [1] }), false);
});

test("zero-parameter tool accepts an empty object", () => {
  const parsed = parseSignature("gimme()");
  const schema = paramsToObjectSchema(parsed.params);
  assert.equal(check(schema, {}), true);
});