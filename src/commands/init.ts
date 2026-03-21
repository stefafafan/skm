import { initLockfile, initManifest } from "../manifest";
import { resolveScope } from "../scope";

export async function runInitCommand(options: {
  cwd: string;
  homeDir?: string;
  xdgConfigHome?: string;
  scope?: "global" | "project";
  force: boolean;
}): Promise<string> {
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

  await initManifest(scope.manifestPath, options.force);
  await initLockfile(scope.lockfilePath, options.force);
  return `Initialized ${scope.kind} manifest at ${scope.manifestPath}`;
}
