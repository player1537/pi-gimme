## 1. Template stripping and package reset

- [ ] 1.1 Delete template example extensions (`extensions/hello.ts`, `extensions/tui-dashboard.ts`, `extensions/skill-bridge/`, `extensions/package-layout/`) and template lib helpers (`lib/greeting.ts`, `lib/format-table.ts`, `lib/config-contract.ts`, `lib/error-contract.ts`); verify `git status` shows only intended deletions
- [ ] 1.2 Delete template example resources (`skills/`, `prompts/`, `themes/`), template-only docs (`docs/template-checklist.md`, `docs/template-sync-checklist.md`, `docs/template-sync.md`, `docs/publish-rerun-rollout.md`, `docs/pi-sdk-compatibility.md`, `docs/release.md`, `docs/examples.md`), and `CHANGELOG.md`; verify they are gone from the working tree
- [ ] 1.3 Reset `package.json` to version `0.1.0`, remove `private: true`, set `pi.extensions` to `["./extensions/index.ts"]`, trim `files` to `extensions/`, `lib/`, `docs/`, `README.md`, `LICENSE`, `SECURITY.md`, and update `description`/`keywords`; verify `npm pack --dry-run` lists only intended files
- [ ] 1.4 Clean `.github/workflows/` of `create-pi-extension` monorepo references (publish/auto-release paths) and keep a minimal CI; verify workflows reference only paths that exist in this repo
- [ ] 1.5 Update `README.md` so install/usage/development sections match the implemented behavior (keep the product vision; align the quickstart prompt and package-contents table); verify README examples match the smoke test

## 2. Signature parser

- [ ] 2.1 Implement `lib/parser.ts` parsing `name(param: type, ...) [ { validation } ]` into `{ name, params, validation? }`; verify unit tests cover scalar types (`string`/`number`/`boolean`), array types (`T[]`), zero-parameter tools, and validation-block extraction
- [ ] 2.2 Add parser rejection paths with clear error messages for nested object types, optional parameters, malformed signatures, and the reserved tool name `_error`; verify unit tests assert each rejection message (spec: Signature grammar)

## 3. Schema mapping

- [ ] 3.1 Implement `lib/schema.ts` mapping parsed parameter types to TypeBox schemas (`Type.String()`, `Type.Number()`, `Type.Boolean()`, `Type.Array(...)`); verify unit tests assert the generated schema accepts matching values and rejects mismatched shapes (spec: Dynamic tool registration)

## 4. Validation runner

- [ ] 4.1 Implement `lib/validate.ts` compiling the validation block with `new Function(...paramNames, body)` and running it synchronously with parsed arguments in scope; verify unit tests cover pass, throw, and argument-scope cases (spec: Validation execution)
- [ ] 4.2 Detect invalid JavaScript in the validation block at compile time and surface a startup error; verify unit test asserts the syntax-error path

## 5. Flag collection

- [ ] 5.1 Implement `lib/flags.ts` scanning `process.argv` for repeated `--gimme <value>` and `--gimme=<value>` tokens, falling back to `pi.getFlag("gimme")`; verify unit tests cover repeated flags, `=` form, and fallback (design: Decision 1)
- [ ] 5.2 Implement `--gimme-max-attempts` parsing (positive integer, default 3) with a startup error for invalid values; verify unit tests cover valid, missing, and invalid values (spec: `--gimme` flag)

## 6. Extension entrypoint

- [ ] 6.1 Implement `extensions/index.ts` registering the `--gimme` and `--gimme-max-attempts` flags, collecting and parsing signatures, and registering one tool per signature with the derived TypeBox schema and final-action description; verify `npm run typecheck` passes and startup errors surface for malformed signatures and conflicting tool names (spec: `--gimme` flag, Signature grammar, Dynamic tool registration)
- [ ] 6.2 Implement tool `execute` running validation with a per-session attempt counter: validation failure returns `isError` while `attempts < max`, and the last error becomes a normal result at the cap; verify unit tests cover the retry and cap paths (spec: Validation execution)
- [ ] 6.3 Implement the prod mechanism: `before_agent_start` system-prompt guidance, `tool_execution_start` call tracking, and `agent_before_settle` appending a `custom_message` entry with `continue: true` only when no tool was called and the cap is not exhausted; verify unit tests cover called/not-called and cap-exhausted cases (spec: Prod mechanism)
- [ ] 6.4 Implement print-mode output: successful calls return `JSON.stringify({ _tool: name, ...args })` as the tool content, exhaustion returns `JSON.stringify({ _tool: "_error", _error: "exhaustion", message })` with the last validation error; verify unit tests assert the exact output strings (spec: Print-mode output)
- [ ] 6.5 Ensure the package is a no-op when `--gimme` is absent (no tools, no prompt injection, no prods); verify unit test covers the no-flag case (spec: No-op without flag)

## 7. Smoke harness and integration

- [ ] 7.1 Adapt `scripts/pi-sdk-smoke.mjs` to load the extension in the real Pi host and assert `--gimme` registers the expected tools (offline, no paid model calls); verify `npm run smoke:pi` passes
- [ ] 7.2 Run the README quickstart end-to-end with an adjusted prompt (e.g. `'Reply with "testing 123" only, using the gimme tool.'`) and verify the output is exactly `{"_tool":"gimme","reply":"testing 123"}` plus newline; record the observed output in the smoke harness or docs

## 8. Full validation

- [ ] 8.1 Run `npm run ci` (typecheck, unit tests, smoke, pack check) and verify it passes end-to-end
- [ ] 8.2 Run `npm pack --dry-run` and verify the tarball contains only `extensions/`, `lib/`, `docs/`, `README.md`, `LICENSE`, `SECURITY.md`; verify no template files remain