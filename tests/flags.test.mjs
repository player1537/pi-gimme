import { test } from "node:test";
import assert from "node:assert/strict";
import { collectGimmeSignatures, collectMaxAttempts, FlagError, parseMaxAttempts } from "../lib/flags.ts";

test("collects a single --gimme flag with a space-separated value", () => {
  const argv = ["pi", "--gimme", "gimme(title: string)"];
  assert.deepEqual(collectGimmeSignatures(argv, undefined), ["gimme(title: string)"]);
});

test("collects repeated --gimme flags in order", () => {
  const argv = [
    "pi",
    "--gimme", "gimme(title: string)",
    "--gimme", "submit_pr_comment(body: string)",
  ];
  assert.deepEqual(collectGimmeSignatures(argv, undefined), [
    "gimme(title: string)",
    "submit_pr_comment(body: string)",
  ]);
});

test("collects the --gimme=value form", () => {
  const argv = ["pi", "--gimme=gimme(title: string)"];
  assert.deepEqual(collectGimmeSignatures(argv, undefined), ["gimme(title: string)"]);
});

test("collects mixed space and equals forms", () => {
  const argv = [
    "pi",
    "--gimme", "gimme(title: string)",
    "--gimme=submit_pr_comment(body: string)",
  ];
  assert.deepEqual(collectGimmeSignatures(argv, undefined), [
    "gimme(title: string)",
    "submit_pr_comment(body: string)",
  ]);
});

test("ignores unrelated flags", () => {
  const argv = ["pi", "--mode", "rpc", "-p", "hello", "--offline"];
  assert.deepEqual(collectGimmeSignatures(argv, undefined), []);
});

test("falls back to the getFlag value when argv has no --gimme", () => {
  const argv = ["pi", "--offline"];
  assert.deepEqual(collectGimmeSignatures(argv, "gimme(title: string)"), [
    "gimme(title: string)",
  ]);
});

test("argv scanning wins over the fallback", () => {
  const argv = ["pi", "--gimme", "gimme(a: string)"];
  assert.deepEqual(collectGimmeSignatures(argv, "gimme(b: number)"), ["gimme(a: string)"]);
});

test("ignores an empty fallback", () => {
  assert.deepEqual(collectGimmeSignatures(["pi"], ""), []);
  assert.deepEqual(collectGimmeSignatures(["pi"], undefined), []);
});

test("throws when --gimme has no value", () => {
  assert.throws(() => collectGimmeSignatures(["pi", "--gimme"], undefined), (err) => {
    assert.ok(err instanceof FlagError);
    assert.equal(err.message, "--gimme requires a value");
    return true;
  });
});

test("throws when --gimme is followed by another flag", () => {
  assert.throws(
    () => collectGimmeSignatures(["pi", "--gimme", "--offline"], undefined),
    (err) => {
      assert.ok(err instanceof FlagError);
      assert.equal(err.message, "--gimme requires a value");
      return true;
    },
  );
});

test("throws when --gimme= has an empty value", () => {
  assert.throws(() => collectGimmeSignatures(["pi", "--gimme="], undefined), (err) => {
    assert.ok(err instanceof FlagError);
    assert.equal(err.message, "--gimme requires a value");
    return true;
  });
});

test("collects --gimme-max-attempts from argv", () => {
  assert.equal(collectMaxAttempts(["pi", "--gimme-max-attempts", "5"], undefined), "5");
  assert.equal(collectMaxAttempts(["pi", "--gimme-max-attempts=7"], undefined), "7");
});

test("falls back for --gimme-max-attempts when argv has none", () => {
  assert.equal(collectMaxAttempts(["pi"], "4"), "4");
  assert.equal(collectMaxAttempts(["pi"], undefined), undefined);
});

test("throws when --gimme-max-attempts has no value", () => {
  assert.throws(() => collectMaxAttempts(["pi", "--gimme-max-attempts"], undefined), (err) => {
    assert.ok(err instanceof FlagError);
    assert.equal(err.message, "--gimme-max-attempts requires a value");
    return true;
  });
});

test("defaults max attempts to 3 when missing", () => {
  assert.equal(parseMaxAttempts(undefined), 3);
  assert.equal(parseMaxAttempts(""), 3);
});

test("parses a valid positive integer", () => {
  assert.equal(parseMaxAttempts("1"), 1);
  assert.equal(parseMaxAttempts("5"), 5);
});

test("rejects invalid max-attempts values", () => {
  for (const value of ["0", "-1", "1.5", "abc"]) {
    assert.throws(() => parseMaxAttempts(value), (err) => {
      assert.ok(err instanceof FlagError);
      assert.match(err.message, /--gimme-max-attempts must be a positive integer/);
      return true;
    });
  }
});