import { renderCliResultAsText } from "../output/render-text.js";
import { renderCliResultWithInkResult } from "../output/render-ink.js";
import { fromSkmPromise, okSkm } from "../shared/errors.js";
import { dispatch } from "./dispatch.js";
import { toCliError } from "../cli/errors.js";
import { type MainContext } from "./global-options.js";

export type { MainContext } from "./global-options.js";

export async function main(argv: string[], context?: MainContext): Promise<number> {
  const cwd = context?.cwd ?? process.cwd();
  const env = context?.env ?? process.env;
  const stdoutIsTTY = context?.stdoutIsTTY ?? process.stdout.isTTY ?? false;
  const stdoutColumns = context?.stdoutColumns ?? process.stdout.columns;

  const outputResult = await fromSkmPromise(dispatch(argv, cwd, env), toCliError);
  if (outputResult.isErr()) {
    process.stderr.write(`${outputResult.error.message}\n`);
    return outputResult.error.exitCode;
  }

  const renderedOutputResult = stdoutIsTTY
    ? await renderCliResultWithInkResult(outputResult.value, { columns: stdoutColumns })
    : okSkm(renderCliResultAsText(outputResult.value));
  if (renderedOutputResult.isErr()) {
    process.stderr.write(`${renderedOutputResult.error.message}\n`);
    return renderedOutputResult.error.exitCode;
  }

  const renderedOutput = renderedOutputResult.value;
  process.stdout.write(renderedOutput.endsWith("\n") ? renderedOutput : `${renderedOutput}\n`);
  return 0;
}
