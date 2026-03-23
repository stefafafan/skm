import path from "node:path";

import { SkmError } from "./errors";

export function validateCanonicalName(canonicalName: string): string {
  if (!canonicalName) {
    throw new SkmError("Invalid canonical name: name is required", 2);
  }

  if (canonicalName === "." || canonicalName === "..") {
    throw new SkmError(`Invalid canonical name: ${canonicalName}`, 2);
  }

  if (canonicalName.includes("/") || canonicalName.includes("\\")) {
    throw new SkmError(`Invalid canonical name: ${canonicalName}`, 2);
  }

  if (/[\u0000-\u001f\u007f<>:"|?*]/.test(canonicalName)) {
    throw new SkmError(`Invalid canonical name: ${canonicalName}`, 2);
  }

  return canonicalName;
}

export function resolveCanonicalSkillPath(
  generatedSkillsDir: string,
  canonicalName: string,
): string {
  return path.join(generatedSkillsDir, validateCanonicalName(canonicalName));
}
