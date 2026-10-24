/**
 * pi-gimme entrypoint.
 *
 * Registers the `--gimme` and `--gimme-max-attempts` flags, parses every
 * `--gimme` signature into a tool, and wires the prod mechanism that steers
 * the model toward calling the tool as its final action.
 *
 * The factory is a no-op when `--gimme` is absent: no tools, no prompt
 * injection, no prods.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseSignature, SignatureParseError } from "../lib/parser.ts";
import { paramsToObjectSchema } from "../lib/schema.ts";
import { compileValidation, ValidationCompileError } from "../lib/validate.ts";
import { collectGimmeSignatures, collectMaxAttempts, parseMaxAttempts } from "../lib/flags.ts";

/** Built-in pi tools a gimme signature must not shadow. */
const BUILTIN_TOOL_NAMES: ReadonlySet<string> = new Set([
  "bash",
  "edit",
  "find",
  "grep",
  "ls",
  "powershell",
  "read",
  "write",
]);

/** Guidance appended to the system prompt so the model calls the tool last. */
const FINAL_ACTION_GUIDANCE =
  "Call the gimme tool as your final action to submit the requested data. " +
  "Do not reply with text instead of calling it. " +
  "After the tool returns, your final message must contain exactly the tool's output and nothing else.";

/** Prod message sent when the agent settles without calling a gimme tool. */
const PROD_MESSAGE =
  "You have not called the gimme tool yet. Call it now as your final action. " +
  "After it returns, your final message must contain exactly the tool's output and nothing else.";

export default function (pi: ExtensionAPI) {
  setupGimme(pi, process.argv);
}

/**
 * Core setup, separated from the default export so unit tests can drive it
 * with a mock `pi` API and a controlled argv.
 */
export function setupGimme(pi: ExtensionAPI, argv: readonly string[]) {
  pi.registerFlag("gimme", {
    type: "string",
    description: "Tool signature to register, e.g. 'gimme(title: string)'. May be repeated.",
  });
  pi.registerFlag("gimme-max-attempts", {
    type: "string",
    description: "Maximum validation attempts before giving up (default: 3).",
  });

  const signatures = collectGimmeSignatures(argv, flagString(pi.getFlag("gimme")));
  if (signatures.length === 0) {
    return;
  }

  const maxAttempts = parseMaxAttempts(
    collectMaxAttempts(argv, flagString(pi.getFlag("gimme-max-attempts"))),
  );

  // Parse every signature up front; any failure is a startup error.
  const tools = signatures.map((signature) => {
    try {
      return parseSignature(signature);
    } catch (err) {
      if (err instanceof SignatureParseError) {
        throw new Error(`Invalid --gimme signature: ${err.message}`);
      }
      throw err;
    }
  });

  // Reject conflicts: duplicates within the invocation and built-in tool names.
  const seen = new Set<string>();
  for (const tool of tools) {
    if (seen.has(tool.name)) {
      throw new Error(
        `Conflicting tool name "${tool.name}" registered by multiple --gimme signatures`,
      );
    }
    if (BUILTIN_TOOL_NAMES.has(tool.name)) {
      throw new Error(`Conflicting tool name "${tool.name}": it is a built-in pi tool`);
    }
    seen.add(tool.name);
  }

  // Compile validators up front so a syntax error fails startup.
  const validators = new Map<string, ((args: Record<string, unknown>) => void) | undefined>();
  for (const tool of tools) {
    try {
      validators.set(tool.name, compileValidation(tool));
    } catch (err) {
      if (err instanceof ValidationCompileError) {
        throw new Error(err.message);
      }
      throw err;
    }
  }

  const toolNames = new Set(tools.map((tool) => tool.name));

  // Per-session state: per-tool call counts, prod count, and flags.
  const state = {
    toolCalls: new Map<string, number>(),
    prods: 0,
    toolCalled: false,
    exhausted: false,
    /** JSON to substitute for the model's next plain-text message. */
    pendingOutput: undefined as string | undefined,
  };

  pi.on("session_start", () => {
    state.toolCalls.clear();
    state.prods = 0;
    state.toolCalled = false;
    state.exhausted = false;
    state.pendingOutput = undefined;
  });

  for (const tool of tools) {
    const schema = paramsToObjectSchema(tool.params);
    pi.registerTool({
      name: tool.name,
      label: tool.name,
      description:
        `Call this tool as your final action to submit the requested data. ` +
        `Do not reply with text instead of calling it. ` +
        `After the tool returns, your final message must contain exactly the tool's output and nothing else.`,
      promptSnippet: `${tool.name}: call as your final action to submit the requested data`,
      promptGuidelines: [
        `Call ${tool.name} as your final action when you have the requested data; do not reply with conversational text instead.`,
        `After ${tool.name} returns, your final message must contain exactly the tool's output and nothing else.`,
      ],
      parameters: schema,
      async execute(_toolCallId, params) {
        const args = params as Record<string, unknown>;
        const count = (state.toolCalls.get(tool.name) ?? 0) + 1;
        state.toolCalls.set(tool.name, count);
        state.toolCalled = true;

        const validate = validators.get(tool.name);
        let error: string | undefined;
        if (validate) {
          try {
            validate(args);
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);
          }
        }

        if (error !== undefined) {
          if (count < maxAttempts) {
            // Model may retry with corrected arguments.
            return {
              content: [{ type: "text", text: `Validation failed: ${error}` }],
              details: {},
              isError: true,
            };
          }
          // Cap reached: the last error becomes the output.
          state.exhausted = true;
          const exhaustionOutput = JSON.stringify({
            _tool: "_error",
            _error: "exhaustion",
            message: error,
          });
          state.pendingOutput = exhaustionOutput;
          return {
            content: [{ type: "text", text: exhaustionOutput }],
            details: {},
          };
        }

        const output = JSON.stringify({ _tool: tool.name, ...args });
        state.pendingOutput = output;
        return {
          content: [{ type: "text", text: output }],
          details: {},
        };
      },
    });
  }

  pi.on("before_agent_start", (event) => {
    state.toolCalled = false;
    if (state.exhausted || state.prods >= maxAttempts) {
      return;
    }
    event.systemPromptOptions.promptGuidelines.push(FINAL_ACTION_GUIDANCE);
  });

  pi.on("tool_execution_start", (event) => {
    if (toolNames.has(event.toolName)) {
      state.toolCalled = true;
    }
  });

  // `-p` mode prints the final assistant message's text, not the tool result.
  // After a successful gimme call (or exhaustion), substitute the JSON for the
  // model's next plain-text message so the printed output is exactly the tool
  // result. Messages that carry further tool calls are left alone.
  pi.on("message_end", (event) => {
    if (state.pendingOutput === undefined) {
      return;
    }
    if (event.message.role !== "assistant") {
      return;
    }
    const hasToolCall = event.message.content.some((content) => content.type === "toolCall");
    if (hasToolCall) {
      return;
    }
    const output = state.pendingOutput;
    state.pendingOutput = undefined;
    return {
      message: { ...event.message, content: [{ type: "text", text: output }] },
    };
  });

  pi.on("agent_before_settle", () => {
    if (state.toolCalled || state.exhausted || state.prods >= maxAttempts) {
      return;
    }
    state.prods += 1;
    return {
      entries: [
        {
          type: "custom_message",
          customType: "gimme-prod",
          content: PROD_MESSAGE,
          display: false,
        },
      ],
      continue: true,
    };
  });
}

function flagString(value: boolean | string | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}