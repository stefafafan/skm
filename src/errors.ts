export class SkmError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "SkmError";
    this.exitCode = exitCode;
  }
}

export function isSkmError(error: unknown): error is SkmError {
  return error instanceof SkmError;
}

export function getSkmError(error: unknown): SkmError | undefined {
  return isSkmError(error) ? error : undefined;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function getErrorStderr(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "stderr" in error &&
    typeof error.stderr === "string"
  ) {
    return error.stderr;
  }
  return undefined;
}
