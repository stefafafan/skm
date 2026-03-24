import path from "node:path";

import { errSkm, okSkm, unwrapOrThrow, type SkmResult } from "./errors.js";

export function validateCanonicalNameResult(canonicalName: string): SkmResult<string> {
  if (!canonicalName) {
    return errSkm("Invalid canonical name: name is required", 2);
  }

  if (canonicalName === "." || canonicalName === "..") {
    return errSkm(`Invalid canonical name: ${canonicalName}`, 2);
  }

  if (canonicalName.includes("/") || canonicalName.includes("\\")) {
    return errSkm(`Invalid canonical name: ${canonicalName}`, 2);
  }

  if (containsControlOrWindowsHostileCharacters(canonicalName)) {
    return errSkm(`Invalid canonical name: ${canonicalName}`, 2);
  }

  return okSkm(canonicalName);
}

export function validateCanonicalName(canonicalName: string): string {
  return unwrapOrThrow(validateCanonicalNameResult(canonicalName));
}

export function resolveCanonicalSkillPath(
  generatedSkillsDir: string,
  canonicalName: string,
): string {
  return unwrapOrThrow(resolveCanonicalSkillPathResult(generatedSkillsDir, canonicalName));
}

export function resolveCanonicalSkillPathResult(
  generatedSkillsDir: string,
  canonicalName: string,
): SkmResult<string> {
  return validateCanonicalNameResult(canonicalName).map((validCanonicalName) =>
    path.join(generatedSkillsDir, validCanonicalName),
  );
}

function containsControlOrWindowsHostileCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
    if ('<>:"|?*'.includes(char)) {
      return true;
    }
  }

  return false;
}
