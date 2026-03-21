import { type ScopeKind } from "./scope";

export interface CliDetail {
  label: string;
  value: string;
}

export interface CliSkillSummary {
  name: string;
  status?: "added" | "installed" | "updated" | "removed" | "renamed" | "skipped";
  previousName?: string;
  source?: string;
  requested?: string;
  resolved?: string;
  integrity?: string;
}

export interface CliSummaryResult {
  kind: "summary";
  command: "init" | "add" | "install" | "update" | "remove" | "rename";
  scope: ScopeKind;
  summary: string;
  details?: CliDetail[];
  skills?: CliSkillSummary[];
}

export interface CliListRow {
  name: string;
  scope: ScopeKind;
  source: string;
  requested?: string;
  resolved?: string;
  effective: "active" | "overridden";
}

export interface CliListResult {
  kind: "list";
  all: boolean;
  rows: CliListRow[];
}

export interface CliInspectResult {
  kind: "inspect";
  name: string;
  scope: ScopeKind;
  details: CliDetail[];
}

export type CliResult = CliSummaryResult | CliListResult | CliInspectResult;

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
  }
}
