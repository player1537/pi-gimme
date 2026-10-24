## Why

The repository is a fork of the `create-pi-extension` template whose README describes `pi-gimme` — a package that extracts structured data from Pi by giving the model a `gimme()` tool — but none of the product exists yet. Every file is still template example code. This change implements the core product: the `--gimme` CLI flag, signature parsing, dynamic tool registration, validation, the prod mechanism, and the print-mode output contract.

## What Changes

- **Strip template scaffolding**: remove template example extensions (`hello.ts`, `tui-dashboard.ts`, `skill-bridge/`, `package-layout/`), template lib helpers (`greeting.ts`, `format-table.ts`, `config-contract.ts`, `error-contract.ts`), example skill/prompt/theme, and template-only docs. Keep only `extensions/`, `lib/`, and `docs/` as package content.
- **Reset package metadata**: version `0.1.0`, flip `private: true` → public, rewrite `description`, update `pi.extensions` manifest to the real entrypoint(s), delete `CHANGELOG.md` (git history serves that purpose), and clean template-only CI/release workflow references to `packages/create-pi-extension`.
- **Add `--gimme` CLI flag** (registered via `pi.registerFlag`): accepts one or more tool signatures. Multiple `--gimme` flags are supported by scanning `process.argv` (the CLI's flag map keeps only the last value per name — verified empirically).
- **Signature grammar**: `name(param: type, ...)` where `type` ∈ `string | number | boolean | T[]` (array of any scalar). No nested objects, no optional parameters. An optional `{ ... }` validation block may follow the parameter list.
- **Dynamic tool registration**: one tool per signature, with a TypeBox parameter schema derived from the grammar and an auto-generated description/prompt guidance instructing the model to call the tool as its final action.
- **Validation**: the `{ ... }` block runs synchronously via `new Function(...)` with the parsed arguments in scope as variables. A thrown error is returned to the model as a tool error for another attempt, capped by `--gimme-max-attempts` (default 3). The extension tracks attempts itself rather than relying on Pi's unbounded tool-error loop.
- **Prod mechanism**: `before_agent_start` injects system-prompt guidance; if the agent settles without calling any gimme tool, `agent_before_settle` appends a `custom_message` entry and returns `continue: true` for one more model request, guarded by the attempt cap.
- **Output contract**: in `-p` mode the user sees only the tool result — a single-line JSON object followed by a newline, prefixed with a `_tool` field naming the tool. On validation exhaustion, the output is a JSON object with `_tool` set to `"_error"` and `_error` set to `"exhaustion"` carrying the last validation error.
- **Tests**: replace all template test suites with unit tests (signature parser, validation runner, flag collection) and adapt the Pi-host smoke harness to assert `--gimme` registers tools end-to-end.

## Capabilities

### New Capabilities
- `gimme-tool`: the `--gimme` flag, signature grammar, dynamic tool registration, validation with attempt cap, prod mechanism, and print-mode output contract.

### Modified Capabilities
<!-- None: this repository has no existing specs. -->

## Impact

- **Code**: `extensions/` (new entrypoint implementing the flag + tool registration), `lib/` (signature parser, validation runner, flag collection), `tests/` (rewritten), `scripts/` (smoke harness adapted).
- **Package metadata**: `package.json` (version, private flag, `pi.extensions`, description, files), `CHANGELOG.md` (deleted), `.github/workflows/` (template-only references removed).
- **Docs**: `README.md` (already describes the product; align with implemented behavior), `docs/` (delete template-only docs, keep or add usage docs).
- **Dependencies**: existing peer/dev deps (`@earendil-works/pi-*` 1.2.0, `typebox`) are sufficient; no new dependencies expected.