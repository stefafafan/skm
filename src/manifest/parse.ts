import { SkmError } from "../shared/errors.js";
import {
  type MaterializationStrategy,
  type SkillLockEntry,
  type SkillManifestEntry,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMaterializationStrategy(value: unknown): value is MaterializationStrategy {
  return value === "wrap" || value === "link" || value === "copy";
}

export function parseManifestEntry(
  manifestPath: string,
  skillName: string,
  value: unknown,
): SkillManifestEntry {
  if (!isRecord(value)) {
    throw new SkmError(`Invalid manifest shape at ${manifestPath}: skill "${skillName}" must be an object`, 2);
  }
  if (typeof value.source !== "string") {
    throw new SkmError(
      `Invalid manifest shape at ${manifestPath}: skill "${skillName}" source must be a string`,
      2,
    );
  }
  if (value.requested !== undefined && typeof value.requested !== "string") {
    throw new SkmError(
      `Invalid manifest shape at ${manifestPath}: skill "${skillName}" requested must be a string`,
      2,
    );
  }
  if (value.strategy !== undefined && !isMaterializationStrategy(value.strategy)) {
    throw new SkmError(
      `Invalid manifest shape at ${manifestPath}: skill "${skillName}" strategy must be one of wrap, link, or copy`,
      2,
    );
  }

  return {
    source: value.source,
    requested: value.requested,
    strategy: value.strategy,
  };
}

export function parseLockEntry(
  lockfilePath: string,
  skillName: string,
  value: unknown,
): SkillLockEntry {
  if (!isRecord(value)) {
    throw new SkmError(`Invalid lockfile shape at ${lockfilePath}: skill "${skillName}" must be an object`, 2);
  }
  if (typeof value.resolved !== "string") {
    throw new SkmError(
      `Invalid lockfile shape at ${lockfilePath}: skill "${skillName}" resolved must be a string`,
      2,
    );
  }
  if (typeof value.integrity !== "string") {
    throw new SkmError(
      `Invalid lockfile shape at ${lockfilePath}: skill "${skillName}" integrity must be a string`,
      2,
    );
  }

  return {
    resolved: value.resolved,
    integrity: value.integrity,
  };
}
