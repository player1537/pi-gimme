## Context

The repository is a `create-pi-extension` template fork with no product code (see proposal.md — Why). The Pi SDK 1.2.0 (pinned in `package.json`) provides every mechanism needed: `pi.registerFlag()` / `pi.getFlag()` for the CLI flag, `pi.registerTool()` for dynamic tool registration, `before_agent_start` for system-prompt injection, and `agent_before_settle` for the prod (append `custom_message` entry + `continue: true`). Tool errors are returned to the model automatically, which is the retry loop the attempt cap must bound.

Two SDK facts were verified empirically against the installed Pi 1.0.3 CLI + 1.2.0 SDK:

1. The CLI collects unknown flags into a `Map` (`parseArgs` → `unknownFlags.set(name, value)`), so **repeated `--gimme` flags overwrite** — `pi.getFlag("gimme")` returns only the last value.
2. `process.argv` retains every raw `--gimme` occurrence, so the extension can collect all signatures itself.

## Goals / Non-Goals

**Goals:**
- Implement the full `--gimme` flow: flag collection → signature parsing → dynamic tool registration → validation with attempt cap → prod mechanism → print-mode output.
- Strip the template to a minimal `extensions/` + `lib/` + `docs/` package and reset metadata to a publishable 0.1.0.
- Keep the implementation testable without paid model calls (parser/validator unit tests + a Pi-host smoke harness).

**Non-Goals:**
- Nested object types, optional parameters, async validation (`async gimme(...)`), and non-`-p` output customization — explicitly deferred (see proposal.md).
- Changing Pi's CLI to support repeated flags natively.
- Non-zero exit codes on validation exhaustion (pi controls process exit; see Open Questions).

## Decisions

### 1. Multiple `--gimme` flags via `process.argv` scanning

The CLI's flag map keeps only the last value per flag name, so repeated `--gimme` flags cannot be read through `pi.getFlag()`. Instead, the extension scans `process.argv` for `--gimme <value>` and `--gimme=<value>` tokens and collects every occurrence. `pi.getFlag("gimme")` remains the fallback when argv scanning finds nothing (covers load paths where argv is unavailable, e.g. RPC).

- **Alternatives considered:** (a) a delimiter inside one flag value (`--gimme 'sig1\nsig2'`) — fragile because validation blocks can contain arbitrary JS; (b) numbered flags (`--gimme-2`) — arbitrary and ugly; (c) a file-based flag (`--gimme @file`) — changes the README's inline UX. argv scanning keeps the exact `pi --gimme 's1' --gimme 's2'` UX.

### 2. Hand-written signature parser in `lib/parser.ts`

The grammar is small (`name(param: type, ...) [ { validation } ]`), so a hand-written tokenizer/parser is more robust and gives better error messages than a regex. It produces a `ParsedSignature { name, params: [{name, type}], validation?: string }`. Types map to TypeBox: `string` → `Type.String()`, `number` → `Type.Number()`, `boolean` → `Type.Boolean()`, `T[]` → `Type.Array(Type[T]())`. The parser rejects nested objects, optional parameters, and the reserved tool name `_error` with specific messages (spec: Signature grammar).

### 3. Validation via `new Function`, sync, executed in the tool

The validation block is compiled with `new Function(...paramNames, validationBody)` at startup — a `SyntaxError` there is caught and reported as a startup error (spec: Validation execution). At tool-call time the function is invoked with the parsed argument values in scope. A throw becomes a tool error returned to the model.

### 4. Extension-managed attempt cap, not Pi's unbounded loop

Pi automatically returns tool errors to the model for another attempt; the extension must bound this. A per-session counter tracks tool calls. On validation failure: if `attempts < max` → return `{ isError: true, content: error }` (model may retry); if `attempts >= max` → return the error as a normal result (retry loop stops, error becomes the output). `--gimme-max-attempts` (default 3) is a registered string flag parsed to a positive integer; invalid values fail startup (spec: `--gimme` flag).

### 5. Prod mechanism: system prompt + one bounded settle-time steer

- `before_agent_start`: when tools are registered and the cap is not exhausted, append guidance to the system prompt: call the gimme tool as the final action; do not reply with text instead.
- Track whether any gimme tool was called this run via `tool_execution_start`.
- `agent_before_settle`: if no gimme tool was called and `attempts < max`, append a `custom_message` entry ("call the gimme tool now") and return `continue: true` for one more model request. The cap bounds the loop (spec: Prod mechanism). Same behavior in `-p` and interactive modes.

### 6. Print-mode output: single-line JSON

The tool's `execute` returns `content: [{ type: "text", text: JSON.stringify({ _tool: name, ...args }) }]`. `-p` mode prints the **final assistant message's text**, not the tool result, so the extension substitutes the JSON for the model's next plain-text message via a `message_end` handler (replacement keeps the assistant role; the session mutates the message in place, so agent state, the persisted transcript, and `-p` output all agree). Messages that carry further tool calls are left untouched. A successful call therefore yields `{"_tool":"gimme","title":"x","body":"y"}\n` (JSON.stringify is single-line; pi appends the newline). The `_tool` field lets callers distinguish which of several registered tools produced the output. On exhaustion the tool returns `JSON.stringify({ _tool: "_error", _error: "exhaustion", message })` where `message` is the last validation error (spec: Print-mode output).

### 7. Package layout and template stripping

- `extensions/index.ts` — single entrypoint: registers flags, collects signatures, registers tools, wires prod events.
- `lib/parser.ts`, `lib/schema.ts`, `lib/validate.ts`, `lib/flags.ts` — parser, TypeBox mapping, validation runner, argv scanning.
- Delete: template extensions (`hello.ts`, `tui-dashboard.ts`, `skill-bridge/`, `package-layout/`), template lib helpers, `skills/`, `prompts/`, `themes/`, template-only docs, `CHANGELOG.md`.
- `package.json`: version `0.1.0`, `private` removed, `pi.extensions` → `["./extensions/index.ts"]`, `files` trimmed, description/keywords updated.
- `.github/workflows/`: drop `create-pi-extension` monorepo references (publish/auto-release paths); keep a minimal CI.
- Tests: replace all template suites with `parser`, `schema`, `validate`, `flags` unit tests; adapt `scripts/pi-sdk-smoke.mjs` to assert `--gimme` registers tools in the real Pi host (offline, no paid model calls).

## Risks / Trade-offs

- [Reliance on `process.argv` for multiple flags] → Fallback to `pi.getFlag()` keeps the single-flag case working on any load path; if pi ever rewrites argv or loads extensions out-of-process, only the multi-flag case degrades.
- [Model writes preamble text before the tool call in `-p` mode] → pi prints the final message, so preamble may appear before the JSON. System-prompt guidance ("call the tool as your final action") minimizes this; the smoke test verifies actual output.
- [Prod loop if the model never calls the tool] → Bounded by `--gimme-max-attempts`; after the cap, no more prods (spec: Prod mechanism).
- [Tool name conflicts with built-ins] → pi's exact duplicate-registration behavior (throw vs replace) needs verification during implementation; the parser/registration path surfaces a clear startup error.
- [`new Function` executes user-supplied code] → Same trust level as the package itself; Pi packages run with local permissions (README Security section already documents this).

## Migration Plan

This is a new package (no prior release of `pi-gimme` exists — the 0.3.x history belongs to the template). No migration. Deployment is the first publish of 0.1.0 after `npm run ci` passes.

## Open Questions

- **Exit code on validation exhaustion**: pi controls the process exit code; making `-p` exit non-zero on failure may require pi-side support. Deferred — the spec only requires the error message as output.
- **Exact pi behavior on duplicate tool registration** (throw vs silent replace): verify during implementation; the spec requires a clear startup error either way.
- **Whether `-p` prints model preamble text before the tool result**: resolved — `-p` prints the final assistant message, so the `message_end` substitution (Decision 6) makes the output exactly the tool result regardless of model preamble. Verified end-to-end against a real model (see `docs/quickstart-verification.md`).