import { test } from "node:test";
import assert from "node:assert/strict";
import { Compile } from "typebox/compile";
import { setupGimme } from "../extensions/index.ts";

function createMockPi({ flags = {} } = {}) {
  const registeredFlags = [];
  const tools = [];
  const handlers = new Map();
  const pi = {
    registerFlag(name, options) {
      registeredFlags.push({ name, options });
    },
    getFlag(name) {
      return flags[name];
    },
    registerTool(definition) {
      tools.push(definition);
    },
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(handler);
      return () => {};
    },
  };
  return { pi, registeredFlags, tools, handlers };
}

function invoke(handlers, event, eventData) {
  const list = handlers.get(event) ?? [];
  const results = list.map((handler) => handler(eventData));
  return results.length === 1 ? results[0] : results;
}

function check(schema, value) {
  return Compile(schema).Check(value);
}

test("registers the gimme flags", () => {
  const { pi, registeredFlags } = createMockPi();
  setupGimme(pi, ["pi"]);
  assert.deepEqual(
    registeredFlags.map((f) => f.name),
    ["gimme", "gimme-max-attempts"],
  );
  assert.equal(registeredFlags[0].options.type, "string");
  assert.equal(registeredFlags[1].options.type, "string");
});

test("registers one tool per signature with the derived schema", () => {
  const { pi, tools } = createMockPi();
  setupGimme(pi, ["pi", "--gimme", "gimme(title: string, count: number)"]);
  assert.equal(tools.length, 1);
  const tool = tools[0];
  assert.equal(tool.name, "gimme");
  assert.equal(tool.label, "gimme");
  assert.match(tool.description, /final action/);
  assert.ok(check(tool.parameters, { title: "x", count: 3 }));
  assert.equal(check(tool.parameters, { title: "x", count: "3" }), false);
  assert.equal(check(tool.parameters, { title: "x" }), false);
});

test("registers multiple tools from repeated flags", () => {
  const { pi, tools } = createMockPi();
  setupGimme(pi, [
    "pi",
    "--gimme", "gimme(title: string)",
    "--gimme", "submit_pr_comment(body: string)",
  ]);
  assert.deepEqual(
    tools.map((t) => t.name),
    ["gimme", "submit_pr_comment"],
  );
  assert.ok(check(tools[0].parameters, { title: "x" }));
  assert.ok(check(tools[1].parameters, { body: "y" }));
});

test("registers a zero-parameter tool", () => {
  const { pi, tools } = createMockPi();
  setupGimme(pi, ["pi", "--gimme", "gimme()"]);
  assert.equal(tools.length, 1);
  assert.ok(check(tools[0].parameters, {}));
});

test("fails startup on a malformed signature", () => {
  const { pi } = createMockPi();
  assert.throws(
    () => setupGimme(pi, ["pi", "--gimme", "gimme(title string)"]),
    /Invalid --gimme signature: Malformed parameter "title string": expected "name: type"/,
  );
});

test("fails startup on a reserved tool name", () => {
  const { pi } = createMockPi();
  assert.throws(
    () => setupGimme(pi, ["pi", "--gimme", "_error(message: string)"]),
    /"_error" is a reserved tool name/,
  );
});

test("fails startup on conflicting tool names", () => {
  const { pi } = createMockPi();
  assert.throws(
    () =>
      setupGimme(pi, [
        "pi",
        "--gimme", "gimme(a: string)",
        "--gimme", "gimme(b: number)",
      ]),
    /Conflicting tool name "gimme" registered by multiple --gimme signatures/,
  );
});

test("fails startup when the name conflicts with a built-in tool", () => {
  const { pi } = createMockPi();
  assert.throws(
    () => setupGimme(pi, ["pi", "--gimme", "read(path: string)"]),
    /Conflicting tool name "read": it is a built-in pi tool/,
  );
});

test("fails startup on an invalid validation block", () => {
  const { pi } = createMockPi();
  assert.throws(
    () => setupGimme(pi, ["pi", "--gimme", "gimme(x: number) { if (x }"]),
    /Validation block for "gimme" is not valid JavaScript/,
  );
});

test("fails startup on invalid max attempts", () => {
  const { pi } = createMockPi();
  assert.throws(
    () =>
      setupGimme(pi, ["pi", "--gimme", "gimme(x: number)", "--gimme-max-attempts", "0"]),
    /--gimme-max-attempts must be a positive integer/,
  );
});

test("fails startup when --gimme has no value", () => {
  const { pi } = createMockPi();
  assert.throws(
    () => setupGimme(pi, ["pi", "--gimme"]),
    /--gimme requires a value/,
  );
});

test("successful call returns the single-line JSON output", async () => {
  const { pi, tools } = createMockPi();
  setupGimme(pi, ["pi", "--gimme", "gimme(title: string, body: string)"]);
  const result = await tools[0].execute("call-1", { title: "x", body: "y" });
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0].text, '{"_tool":"gimme","title":"x","body":"y"}');
});

test("validation failure returns isError while attempts remain", async () => {
  const { pi, tools } = createMockPi();
  setupGimme(pi, [
    "pi",
    "--gimme", "gimme(title: string) { if (title.length < 3) throw new Error(\"too short\"); }",
  ]);
  const result = await tools[0].execute("call-1", { title: "ab" });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, "Validation failed: too short");
});

test("the last validation error becomes the output at the cap", async () => {
  const { pi, tools } = createMockPi();
  setupGimme(pi, [
    "pi",
    "--gimme-max-attempts", "2",
    "--gimme", "gimme(title: string) { if (title.length < 3) throw new Error(\"too short\"); }",
  ]);
  const first = await tools[0].execute("call-1", { title: "ab" });
  assert.equal(first.isError, true);
  const last = await tools[0].execute("call-2", { title: "a" });
  assert.equal(last.isError, undefined);
  assert.equal(
    last.content[0].text,
    '{"_tool":"_error","_error":"exhaustion","message":"too short"}',
  );
});

test("multiple tools are distinguishable by the _tool field", async () => {
  const { pi, tools } = createMockPi();
  setupGimme(pi, [
    "pi",
    "--gimme", "gimme(title: string)",
    "--gimme", "submit_pr_comment(body: string)",
  ]);
  const gimmeResult = await tools[0].execute("call-1", { title: "x" });
  const prResult = await tools[1].execute("call-2", { body: "y" });
  assert.equal(gimmeResult.content[0].text, '{"_tool":"gimme","title":"x"}');
  assert.equal(prResult.content[0].text, '{"_tool":"submit_pr_comment","body":"y"}');
});

test("before_agent_start injects final-action guidance", () => {
  const { pi, handlers } = createMockPi();
  setupGimme(pi, ["pi", "--gimme", "gimme(title: string)"]);
  const event = { systemPromptOptions: { promptGuidelines: [] } };
  invoke(handlers, "before_agent_start", event);
  assert.equal(event.systemPromptOptions.promptGuidelines.length, 1);
  assert.match(event.systemPromptOptions.promptGuidelines[0], /final action/);
});

test("tool_execution_start marks the tool as called", () => {
  const { pi, handlers } = createMockPi();
  setupGimme(pi, ["pi", "--gimme", "gimme(title: string)"]);
  invoke(handlers, "tool_execution_start", { toolName: "gimme", args: {} });
  // A settle after the call must not prod.
  const result = invoke(handlers, "agent_before_settle", {});
  assert.equal(result, undefined);
});

test("agent_before_settle prods when no tool was called", () => {
  const { pi, handlers } = createMockPi();
  setupGimme(pi, ["pi", "--gimme", "gimme(title: string)"]);
  const result = invoke(handlers, "agent_before_settle", {});
  assert.equal(result.continue, true);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].type, "custom_message");
  assert.match(result.entries[0].content, /Call it now as your final action/);
});

test("prodding stops once the attempt cap is exhausted", () => {
  const { pi, handlers } = createMockPi();
  setupGimme(pi, [
    "pi",
    "--gimme-max-attempts", "2",
    "--gimme", "gimme(title: string)",
  ]);
  assert.equal(invoke(handlers, "agent_before_settle", {})?.continue, true);
  assert.equal(invoke(handlers, "agent_before_settle", {})?.continue, true);
  assert.equal(invoke(handlers, "agent_before_settle", {}), undefined);
});

test("no prod after a tool call, even with attempts remaining", async () => {
  const { pi, tools, handlers } = createMockPi();
  setupGimme(pi, ["pi", "--gimme", "gimme(title: string)"]);
  await tools[0].execute("call-1", { title: "x" });
  assert.equal(invoke(handlers, "agent_before_settle", {}), undefined);
});

test("message_end substitutes the tool output for the model's final text", async () => {
  const { pi, tools, handlers } = createMockPi();
  setupGimme(pi, ["pi", "--gimme", "gimme(title: string)"]);
  await tools[0].execute("call-1", { title: "x" });
  const result = invoke(handlers, "message_end", {
    message: { role: "assistant", content: [{ type: "text", text: "Here you go" }] },
  });
  assert.deepEqual(result.message.content, [{ type: "text", text: '{"_tool":"gimme","title":"x"}' }]);
  // A second message is left alone once the output was substituted.
  const second = invoke(handlers, "message_end", {
    message: { role: "assistant", content: [{ type: "text", text: "more" }] },
  });
  assert.equal(second, undefined);
});

test("message_end leaves tool-call messages alone", async () => {
  const { pi, tools, handlers } = createMockPi();
  setupGimme(pi, ["pi", "--gimme", "gimme(title: string)"]);
  await tools[0].execute("call-1", { title: "x" });
  const result = invoke(handlers, "message_end", {
    message: {
      role: "assistant",
      content: [{ type: "toolCall", name: "bash", args: {}, toolCallId: "c1" }],
    },
  });
  assert.equal(result, undefined);
});

test("message_end substitutes the exhaustion output", async () => {
  const { pi, tools, handlers } = createMockPi();
  setupGimme(pi, [
    "pi",
    "--gimme-max-attempts", "1",
    "--gimme", 'gimme(title: string) { throw new Error("boom"); }',
  ]);
  await tools[0].execute("call-1", { title: "x" });
  const result = invoke(handlers, "message_end", {
    message: { role: "assistant", content: [{ type: "text", text: "done" }] },
  });
  assert.deepEqual(result.message.content, [
    { type: "text", text: '{"_tool":"_error","_error":"exhaustion","message":"boom"}' },
  ]);
});

test("no-op when --gimme is absent", () => {
  const { pi, tools, handlers } = createMockPi();
  setupGimme(pi, ["pi", "--offline"]);
  assert.equal(tools.length, 0);
  assert.equal(handlers.size, 0);
});

test("falls back to the getFlag value when argv has no --gimme", () => {
  const { pi, tools } = createMockPi({ flags: { gimme: "gimme(title: string)" } });
  setupGimme(pi, ["pi"]);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "gimme");
});