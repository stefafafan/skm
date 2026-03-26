import { SkmError, isSkmError, toSkmError } from "../shared/errors.js";

export function toCliError(error: unknown): SkmError {
  if (isSkmError(error)) {
    return error;
  }
  if (isCacError(error)) {
    return new SkmError(error.message, 2);
  }
  return toSkmError(error);
}

export function findUnknownGlobalOption(options: Record<string, unknown>): string | undefined {
  const knownGlobalOptions = new Set(["--", "global", "h", "help", "project", "v", "version"]);
  return Object.keys(options).find((name) => !knownGlobalOptions.has(name));
}

export function formatUnknownOption(name: string): string {
  return `Unknown option \`${name.length > 1 ? `--${name}` : `-${name}`}\``;
}

function isCacError(error: unknown): error is Error {
  return error instanceof Error && error.constructor.name === "CACError";
}
