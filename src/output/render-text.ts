import type { CliResult } from "./cli-result.js";

export function renderCliResultAsText(result: CliResult): string {
  switch (result.kind) {
    case "summary":
      return `${result.summary}\n`;
    case "list": {
      const lines = ["name\tscope\tsource\trequested\tresolved\teffective"];
      for (const row of result.rows) {
        lines.push(
          [
            row.name,
            row.scope,
            row.source,
            row.requested ?? "",
            row.resolved ?? "",
            row.effective,
          ].join("\t"),
        );
      }
      return `${lines.join("\n")}\n`;
    }
    case "inspect":
      return `${result.details.map((detail) => `${detail.label}: ${detail.value}`).join("\n")}\n\n`;
    case "help": {
      const lines = [result.title, "", `Usage: ${result.usage}`];
      for (const section of result.sections) {
        lines.push("", `${section.title}:`, ...section.lines);
      }
      return `${lines.join("\n")}\n`;
    }
    case "version":
      return `${result.version}\n`;
  }
}
