import { Result, ResultAsync, err, fromThrowable, ok } from "neverthrow";

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

export type SkmResult<T> = Result<T, SkmError>;
export type SkmResultAsync<T> = ResultAsync<T, SkmError>;

export type SkmErrorOptions = {
  fallbackMessage?: string;
  exitCode?: number;
};

export function okSkm<T>(value: T): SkmResult<T> {
  return ok(value);
}

export function errSkm(error: string, exitCode?: number): SkmResult<never>;
export function errSkm(error: SkmError): SkmResult<never>;
export function errSkm(error: string | SkmError, exitCode?: number): SkmResult<never> {
  return err(typeof error === "string" ? new SkmError(error, exitCode) : error);
}

export function toSkmError(error: unknown, options?: SkmErrorOptions): SkmError {
  if (isSkmError(error)) {
    return error;
  }

  const fallbackMessage = options?.fallbackMessage ?? "Unexpected error";
  const exitCode = options?.exitCode ?? 1;
  const detail =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);

  return new SkmError(`${fallbackMessage}: ${detail}`, exitCode);
}

export function fromSkmThrowable<Args extends unknown[], Return>(
  fn: (...args: Args) => Return,
  options?: SkmErrorOptions,
): (...args: Args) => SkmResult<Return> {
  return fromThrowable(fn, (error) => toSkmError(error, options));
}

export function fromSkmPromise<T>(
  promise: Promise<T>,
  optionsOrMapper?: SkmErrorOptions | ((error: unknown) => SkmError),
): SkmResultAsync<T> {
  const mapError =
    typeof optionsOrMapper === "function"
      ? optionsOrMapper
      : (error: unknown) => toSkmError(error, optionsOrMapper);
  return ResultAsync.fromPromise(promise, mapError);
}

export function unwrapOrThrow<T>(result: SkmResult<T>): T {
  if (result.isErr()) {
    throw result.error;
  }

  return result.value;
}
