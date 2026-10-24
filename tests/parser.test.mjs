import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSignature, SignatureParseError } from "../lib/parser.ts";

test("parses a signature with scalar parameters", () => {
  const parsed = parseSignature("gimme(title: string, count: number, done: boolean)");
  assert.deepEqual(parsed, {
    name: "gimme",
    params: [
      { name: "title", type: "string" },
      { name: "count", type: "number" },
      { name: "done", type: "boolean" },
    ],
    validation: undefined,
  });
});

test("parses an array parameter type", () => {
  const parsed = parseSignature("gimme(tags: string[])");
  assert.deepEqual(parsed, {
    name: "gimme",
    params: [{ name: "tags", type: "string[]" }],
    validation: undefined,
  });
});

test("parses array types for every scalar", () => {
  for (const scalar of ["string", "number", "boolean"]) {
    const parsed = parseSignature(`gimme(values: ${scalar}[])`);
    assert.deepEqual(parsed.params, [{ name: "values", type: `${scalar}[]` }]);
  }
});

test("parses a zero-parameter tool", () => {
  const parsed = parseSignature("gimme()");
  assert.deepEqual(parsed, { name: "gimme", params: [], validation: undefined });
});

test("extracts the validation block body", () => {
  const parsed = parseSignature("submit_pr_comment(body: string) { if (body.length < 10) throw new Error(\"too short\"); }");
  assert.equal(parsed.name, "submit_pr_comment");
  assert.deepEqual(parsed.params, [{ name: "body", type: "string" }]);
  assert.equal(parsed.validation, "if (body.length < 10) throw new Error(\"too short\");");
});

test("extracts a validation block containing braces in strings", () => {
  const parsed = parseSignature("gimme(text: string) { if (text === \"{not a block}\") throw new Error(\"nope\"); }");
  assert.equal(parsed.validation, "if (text === \"{not a block}\") throw new Error(\"nope\");");
});

test("extracts a validation block containing template literals", () => {
  const parsed = parseSignature("gimme(name: string) { if (name !== `${name}!`) throw new Error(\"boom\"); }");
  assert.equal(parsed.validation, "if (name !== `${name}!`) throw new Error(\"boom\");");
});

test("trims surrounding whitespace", () => {
  const parsed = parseSignature("  gimme( title : string , count : number )  ");
  assert.deepEqual(parsed, {
    name: "gimme",
    params: [
      { name: "title", type: "string" },
      { name: "count", type: "number" },
    ],
    validation: undefined,
  });
});

test("accepts tool names with dashes and underscores", () => {
  const parsed = parseSignature("submit_pr-comment(body: string)");
  assert.equal(parsed.name, "submit_pr-comment");
});

test("rejects an empty signature", () => {
  assert.throws(() => parseSignature("   "), (err) => {
    assert.ok(err instanceof SignatureParseError);
    assert.equal(err.message, "Signature is empty");
    return true;
  });
});

test("rejects a signature without parentheses", () => {
  assert.throws(() => parseSignature("gimme"), (err) => {
    assert.ok(err instanceof SignatureParseError);
    assert.match(err.message, /expected "name\(param: type, \.\.\.\)"/);
    return true;
  });
});

test("rejects an invalid tool name", () => {
  assert.throws(() => parseSignature("123gimme(x: string)"), (err) => {
    assert.ok(err instanceof SignatureParseError);
    assert.match(err.message, /is not a valid tool name/);
    return true;
  });
});

test("rejects the reserved tool name _error", () => {
  assert.throws(() => parseSignature("_error(message: string)"), (err) => {
    assert.ok(err instanceof SignatureParseError);
    assert.equal(err.message, '"_error" is a reserved tool name');
    return true;
  });
});

test("rejects a missing closing parenthesis", () => {
  assert.throws(() => parseSignature("gimme(title: string"), (err) => {
    assert.ok(err instanceof SignatureParseError);
    assert.match(err.message, /missing "\)" after the parameter list/);
    return true;
  });
});

test("rejects an empty parameter", () => {
  assert.throws(() => parseSignature("gimme(, title: string)"), (err) => {
    assert.ok(err instanceof SignatureParseError);
    assert.equal(err.message, "Malformed signature: empty parameter");
    return true;
  });
});

test("rejects an optional parameter", () => {
  assert.throws(() => parseSignature("gimme(title?: string)"), (err) => {
    assert.ok(err instanceof SignatureParseError);
    assert.equal(err.message, 'Optional parameters are not supported: "title?: string"');
    return true;
  });
});

test("rejects a parameter without a type", () => {
  assert.throws(() => parseSignature("gimme(title string)"), (err) => {
    assert.ok(err instanceof SignatureParseError);
    assert.equal(err.message, 'Malformed parameter "title string": expected "name: type"');
    return true;
  });
});

test("rejects an invalid parameter name", () => {
  assert.throws(() => parseSignature("gimme(1title: string)"), (err) => {
    assert.ok(err instanceof SignatureParseError);
    assert.match(err.message, /is not a valid parameter name/);
    return true;
  });
});

test("rejects a nested object type", () => {
  assert.throws(() => parseSignature("gimme(user: { name: string })"), (err) => {
    assert.ok(err instanceof SignatureParseError);
    assert.equal(err.message, 'Nested objects are not supported: "user: { name: string }"');
    return true;
  });
});

test("rejects an unsupported scalar type", () => {
  assert.throws(() => parseSignature("gimme(when: date)"), (err) => {
    assert.ok(err instanceof SignatureParseError);
    assert.match(err.message, /Unsupported type "date"/);
    assert.match(err.message, /expected string, number, boolean, or an array of one of those/);
    return true;
  });
});

test("rejects an unsupported array element type", () => {
  assert.throws(() => parseSignature("gimme(when: date[])"), (err) => {
    assert.ok(err instanceof SignatureParseError);
    assert.match(err.message, /Unsupported type "date\[\]"/);
    return true;
  });
});

test("rejects unexpected text after the parameter list", () => {
  assert.throws(() => parseSignature("gimme(title: string) extra"), (err) => {
    assert.ok(err instanceof SignatureParseError);
    assert.match(err.message, /unexpected "e" after the parameter list/);
    return true;
  });
});

test("rejects an unclosed validation block", () => {
  assert.throws(() => parseSignature("gimme(title: string) { if (title) "), (err) => {
    assert.ok(err instanceof SignatureParseError);
    assert.match(err.message, /unclosed validation block/);
    return true;
  });
});

test("rejects trailing text after the validation block", () => {
  assert.throws(() => parseSignature("gimme(title: string) { if (title) {} } extra"), (err) => {
    assert.ok(err instanceof SignatureParseError);
    assert.match(err.message, /unexpected "e" after the validation block/);
    return true;
  });
});