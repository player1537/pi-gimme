// Offline smoke test: loads the extension in the real Pi host and asserts the
// --gimme flag surface. No model calls are made; tool registration is verified
// indirectly (a clean load with --gimme means every signature parsed and every
// tool registered, since any failure throws during extension load).
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const reportPath = resolve(root, "docs/verification/pi-sdk-smoke.json");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson(resolve(root, "package.json"));
const SDK_NAMES = ["@earendil-works/pi-agent-core", "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent", "@earendil-works/pi-tui"];
const UNHANDLED_ERROR_PATTERN = /UnhandledPromiseRejection|uncaught exception|shutdown error/i;
const EXTENSION_LOAD_ERROR_PATTERN = /Failed to load extension|Error loading extension/i;

const sdkVersions = Object.fromEntries(SDK_NAMES.map((name) =>
  [name, readJson(resolve(root, "node_modules", name, "package.json")).version]));
for (const name of SDK_NAMES) {
  if (manifest.devDependencies?.[name] !== sdkVersions[name]) {
    throw new Error(`Smoke requires the exact dev/test SDK pin for ${name}: installed ${sdkVersions[name]}`);
  }
}
// Run this checkout's actual pinned CLI, not a possibly stale global pi.cmd.
const piManifest = readJson(resolve(root, "node_modules/@earendil-works/pi-coding-agent/package.json"));
const piCli = resolve(root, "node_modules/@earendil-works/pi-coding-agent", piManifest.bin.pi);
const agentDir = mkdtempSync(resolve(tmpdir(), "pi-gimme-smoke-"));
const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir };
const baseArgs = [piCli, "--offline", "--no-session", "--no-tools", "--no-extensions", "--no-skills",
  "--no-context-files", "--no-prompt-templates", "--no-mcp", "-e", ".", "--mode", "rpc"];

function assertion(id, expected, observed, passed) {
  return { id, expected, observed: JSON.stringify(observed), passed: passed === true };
}

function run(name, extraArgs, check) {
  const result = spawnSync(process.execPath, [...baseArgs, ...extraArgs], {
    cwd: root, env, input: "", encoding: "utf8", timeout: 30_000, windowsHide: true,
  });
  const fullOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const exit_code = result.status ?? 1;
  const hasUnhandledError = UNHANDLED_ERROR_PATTERN.test(fullOutput);
  const hasLoadError = EXTENSION_LOAD_ERROR_PATTERN.test(fullOutput);
  const assertions = check({ exit_code, fullOutput, hasLoadError });
  return { name, command: "npm run smoke:pi", exit_code,
    passed: !result.error && !hasUnhandledError && assertions.every((a) => a.passed),
    evidence: fullOutput.slice(-6000) || String(result.error?.message ?? "No output captured"),
    assertions, hasUnhandledError, hasLoadError };
}

try {
  const cases = [
    run("extension_load", ["--gimme", "gimme(reply: string)"], ({ exit_code, hasLoadError }) => [
      assertion("tool_registered", "A clean load with --gimme means the tool registered (any failure throws during load)",
        { exit_code, hasLoadError }, exit_code === 0 && !hasLoadError),
    ]),
    run("noop", [], ({ exit_code, hasLoadError }) => [
      assertion("noop_load", "Loading without --gimme is a clean no-op", { exit_code, hasLoadError },
        exit_code === 0 && !hasLoadError),
    ]),
    run("malformed_signature", ["--gimme", "gimme(reply string)"], ({ exit_code, fullOutput }) => [
      assertion("malformed_rejected", "A malformed signature fails startup with a clear error",
        { exit_code, error: fullOutput.match(/Invalid --gimme signature[^\n]*/)?.[0] ?? null },
        exit_code !== 0 && /Invalid --gimme signature/.test(fullOutput)),
    ]),
    run("reserved_name", ["--gimme", "_error(message: string)"], ({ exit_code, fullOutput }) => [
      assertion("reserved_rejected", "The reserved _error name fails startup", { exit_code },
        exit_code !== 0 && /reserved tool name/.test(fullOutput)),
    ]),
    run("duplicate_tools", ["--gimme", "gimme(a: string)", "--gimme", "gimme(b: number)"], ({ exit_code, fullOutput }) => [
      assertion("duplicate_rejected", "Conflicting tool names fail startup", { exit_code },
        exit_code !== 0 && /Conflicting tool name "gimme"/.test(fullOutput)),
    ]),
    run("invalid_max_attempts", ["--gimme", "gimme(a: string)", "--gimme-max-attempts", "0"], ({ exit_code, fullOutput }) => [
      assertion("attempts_rejected", "A non-positive --gimme-max-attempts fails startup", { exit_code },
        exit_code !== 0 && /--gimme-max-attempts must be a positive integer/.test(fullOutput)),
    ]),
    run("missing_value", ["--gimme"], ({ exit_code, fullOutput }) => [
      assertion("missing_value_rejected", "A value-less --gimme fails startup", { exit_code },
        exit_code !== 0 && /--gimme requires a value/.test(fullOutput)),
    ]),
  ];
  // Fixed/quoted argv tests the real native shell, not Git Bash/cmd assumptions.
  if (process.platform === "win32") {
    const quote = (value) => `'${value.replaceAll("'", "''")}'`;
    const shell = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    const result = spawnSync(shell, ["-NoProfile", "-NonInteractive", "-Command",
      `& ${quote(process.execPath)} ${quote(piCli)} --no-extensions --version; exit $LASTEXITCODE`],
      { cwd: root, env, encoding: "utf8", timeout: 30_000, windowsHide: true });
    const fullOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const exit_code = result.status ?? 1;
    cases.push({
      name: "host_shell", command: "npm run smoke:pi", exit_code,
      passed: exit_code === 0 && fullOutput.trim() === sdkVersions["@earendil-works/pi-coding-agent"],
      evidence: fullOutput.slice(-6000), assertions: [
        assertion("native_shell_boundary", "Native host shell launches locally pinned Pi and returns its exact version",
          { exit_code, output: fullOutput.trim(), expectedVersion: sdkVersions["@earendil-works/pi-coding-agent"] },
          exit_code === 0 && fullOutput.trim() === sdkVersions["@earendil-works/pi-coding-agent"]),
      ], hasUnhandledError: false, hasLoadError: false,
    });
  } else {
    const result = spawnSync("/bin/sh", ["-c", '"$1" "$2" --no-extensions --version', "pi-host-shell", process.execPath, piCli],
      { cwd: root, env, encoding: "utf8", timeout: 30_000, windowsHide: true });
    const fullOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const exit_code = result.status ?? 1;
    cases.push({
      name: "host_shell", command: "npm run smoke:pi", exit_code,
      passed: exit_code === 0 && fullOutput.trim() === sdkVersions["@earendil-works/pi-coding-agent"],
      evidence: fullOutput.slice(-6000), assertions: [
        assertion("native_shell_boundary", "Native host shell launches locally pinned Pi and returns its exact version",
          { exit_code, output: fullOutput.trim(), expectedVersion: sdkVersions["@earendil-works/pi-coding-agent"] },
          exit_code === 0 && fullOutput.trim() === sdkVersions["@earendil-works/pi-coding-agent"]),
      ], hasUnhandledError: false, hasLoadError: false,
    });
  }
  const report = { schema_version: 1, verification_contract: "pi-gimme-load-v1", sdk_versions: sdkVersions,
    platform: process.platform, model_inference: "none; offline load assertions only",
    unhandled_errors: cases.filter((c) => c.hasUnhandledError).length,
    extension_load_errors: cases.filter((c) => c.hasLoadError || (c.name === "extension_load" && !c.passed)).length,
    cases: cases.map(({ hasUnhandledError, hasLoadError, ...item }) => item) };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ verification_contract: "pi-gimme-load-v1", platform: process.platform,
    cases: cases.map((c) => ({ name: c.name, passed: c.passed, exit_code: c.exit_code })) }));
  if (cases.some((c) => !c.passed)) process.exitCode = 1;
} finally {
  rmSync(agentDir, { recursive: true, force: true });
}