import { type ScopeKind } from "./scope";

export type CliDetail = {
  label: string;
  value: string;
};

export type CliSkillSummary = {
  name: string;
  status?: "added" | "installed" | "updated" | "removed" | "renamed" | "skipped";
  previousName?: string;
  source?: string;
  requested?: string;
  resolved?: string;
  integrity?: string;
};

export type CliSummaryResult = {
  kind: "summary";
  command: "init" | "add" | "install" | "update" | "remove" | "rename";
  scope: ScopeKind;
  summary: string;
  details?: CliDetail[];
  skills?: CliSkillSummary[];
};

export type CliListRow = {
  name: string;
  scope: ScopeKind;
  source: string;
  requested?: string;
  resolved?: string;
  effective: "active" | "overridden";
};

export type CliListResult = {
  kind: "list";
  all: boolean;
  rows: CliListRow[];
};

export type CliInspectResult = {
  kind: "inspect";
  name: string;
  scope: ScopeKind;
  details: CliDetail[];
};

export type CliHelpSection = {
  title: string;
  lines: string[];
};

export type CliHelpResult = {
  kind: "help";
  title: string;
  usage: string;
  sections: CliHelpSection[];
};

export type CliVersionResult = {
  kind: "version";
  version: string;
};

export type CliResult =
  | CliSummaryResult
  | CliListResult
  | CliInspectResult
  | CliHelpResult
  | CliVersionResult;

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
