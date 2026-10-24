/**
 * Collects the `--gimme` and `--gimme-max-attempts` flag values.
 *
 * The Pi CLI keeps only the last value per unknown flag, so repeated `--gimme`
 * flags cannot be read through `pi.getFlag()`. Instead we scan `process.argv`
 * for every `--gimme <value>` and `--gimme=<value>` occurrence, falling back to
 * `pi.getFlag("gimme")` when argv scanning finds nothing (covers load paths
 * where argv is unavailable, e.g. RPC).
 */

/** Thrown when a flag value is missing or malformed. */
export class FlagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlagError";
  }
}

/**
 * Collect every `--gimme` signature from an argv array.
 *
 * @throws {FlagError} when a `--gimme` token has no value.
 */
export function collectGimmeSignatures(
  argv: readonly string[],
  fallback: string | undefined,
): string[] {
  const found: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--gimme") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new FlagError("--gimme requires a value");
      }
      found.push(value);
      i += 1;
    } else if (arg.startsWith("--gimme=")) {
      const value = arg.slice("--gimme=".length);
      if (value.length === 0) {
        throw new FlagError("--gimme requires a value");
      }
      found.push(value);
    }
  }
  if (found.length === 0 && fallback !== undefined && fallback.length > 0) {
    found.push(fallback);
  }
  return found;
}

/**
 * Collect the `--gimme-max-attempts` value from an argv array, falling back to
 * `pi.getFlag` when argv has no occurrence.
 *
 * @throws {FlagError} when the flag has no value.
 */
export function collectMaxAttempts(
  argv: readonly string[],
  fallback: string | undefined,
): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--gimme-max-attempts") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new FlagError("--gimme-max-attempts requires a value");
      }
      return value;
    }
    if (arg.startsWith("--gimme-max-attempts=")) {
      const value = arg.slice("--gimme-max-attempts=".length);
      if (value.length === 0) {
        throw new FlagError("--gimme-max-attempts requires a value");
      }
      return value;
    }
  }
  return fallback;
}

const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Parse the `--gimme-max-attempts` value into a positive integer.
 *
 * @throws {FlagError} when the value is not a positive integer.
 */
export function parseMaxAttempts(value: string | undefined): number {
  if (value === undefined || value.length === 0) {
    return DEFAULT_MAX_ATTEMPTS;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new FlagError(
      `--gimme-max-attempts must be a positive integer, got "${value}"`,
    );
  }
  return parsed;
}