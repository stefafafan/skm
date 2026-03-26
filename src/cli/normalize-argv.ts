export function normalizeDashPrefixedOptionValues(argv: string[]): string[] {
  const normalized: string[] = [];
  const optionsWithValues = new Set(["--as", "--output-dir", "--outputDir", "--ref"]);

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === undefined) {
      continue;
    }
    if (current === "--") {
      normalized.push(...argv.slice(index));
      break;
    }
    const next = argv[index + 1];
    if (current && optionsWithValues.has(current) && next && /^-[^-]/.test(next)) {
      normalized.push(`${current}=${next}`);
      index += 1;
      continue;
    }
    normalized.push(current);
  }

  return normalized;
}
