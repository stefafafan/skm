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
