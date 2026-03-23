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

  if (containsControlOrWindowsHostileCharacters(canonicalName)) {
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

function containsControlOrWindowsHostileCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
    if ("<>:\"|?*".includes(char)) {
      return true;
    }
  }

  return false;
}
