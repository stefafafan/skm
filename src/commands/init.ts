import { initLockfile, initManifest } from "../manifest";
import { type CliResult } from "../output";
import { resolveScope } from "../scope";

export async function runInitCommand(options: {
  cwd: string;
  homeDir?: string;
  xdgConfigHome?: string;
  scope?: "global" | "project";
  force: boolean;
  outputDir?: string;
}): Promise<CliResult> {
  const scope =
    options.scope === "global"
      ? await resolveScope({
          cwd: options.cwd,
          homeDir: options.homeDir,
          xdgConfigHome: options.xdgConfigHome,
          explicitScope: "global",
        })
      : await resolveScope({
          cwd: options.cwd,
          homeDir: options.homeDir,
          xdgConfigHome: options.xdgConfigHome,
          explicitScope: "project",
          allowCreateProject: true,
        });

  await initManifest(scope.manifestPath, options.force, options.outputDir);
  await initLockfile(scope.lockfilePath, options.force);
  return {
    kind: "summary",
    command: "init",
    scope: scope.kind,
    summary: `Initialized ${scope.kind} manifest at ${scope.manifestPath}`,
    details: [
      { label: "manifest", value: scope.manifestPath },
      { label: "lockfile", value: scope.lockfilePath },
    ],
  } satisfies CliResult;
}
