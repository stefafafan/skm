import React from "react";

import { errSkm, okSkm, toSkmError, unwrapOrThrow, type SkmResult } from "../shared/errors.js";
import type {
  CliDetail,
  CliListResult,
  CliResult,
  CliSkillSummary,
  CliSummaryResult,
} from "./cli-result.js";

type InkComponentProps = {
  children?: React.ReactNode;
  key?: string;
  bold?: boolean;
  color?: string;
  dimColor?: boolean;
  flexDirection?: "column" | "row";
  marginLeft?: number;
};

type InkModule = {
  renderToString(node: React.ReactNode, options?: { columns?: number }): string;
  Box: React.ComponentType<InkComponentProps>;
  Text: React.ComponentType<InkComponentProps>;
};

async function loadInk(): Promise<InkModule> {
  return (await import("ink")) as InkModule;
}

export async function renderCliResultWithInk(
  result: CliResult,
  options?: { columns?: number },
): Promise<string> {
  return unwrapOrThrow(await renderCliResultWithInkResult(result, options));
}

export async function renderCliResultWithInkResult(
  result: CliResult,
  options?: { columns?: number },
): Promise<SkmResult<string>> {
  let ink: InkModule;
  try {
    ink = await loadInk();
  } catch (error) {
    return errSkm(toSkmError(error));
  }

  try {
    return okSkm(
      ink.renderToString(createResultView(ink, result), {
        columns: options?.columns,
      }),
    );
  } catch (error) {
    return errSkm(toSkmError(error));
  }
}

function createResultView(ink: InkModule, result: CliResult): React.ReactNode {
  switch (result.kind) {
    case "summary":
      return createSummaryView(ink, result);
    case "list":
      return createListView(ink, result);
    case "inspect":
      return createInspectView(ink, result);
    case "help":
      return createHelpView(ink, result);
    case "version":
      return createVersionView(ink, result);
  }
}

function createSummaryView(ink: InkModule, result: CliSummaryResult): React.ReactNode {
  const { Box, Text } = ink;
  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, { color: "green", bold: true }, `[ok] ${result.command}`),
    React.createElement(Text, { dimColor: true }, `scope: ${result.scope}`),
    React.createElement(Text, null, result.summary),
    ...(result.skills && result.skills.length > 0
      ? [
          React.createElement(Text, { key: "skills-heading", bold: true }, "skills"),
          ...result.skills.map((skill, index) => createSkillSummary(ink, skill, index)),
        ]
      : []),
    ...(result.details && result.details.length > 0
      ? [
          React.createElement(Text, { key: "details-heading", bold: true }, "details"),
          ...result.details.map((detail, index) => createDetailRow(ink, detail, `detail-${index}`)),
        ]
      : []),
  );
}

function createListView(ink: InkModule, result: CliListResult): React.ReactNode {
  const { Box, Text } = ink;
  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, { color: "green", bold: true }, "Installed skills"),
    React.createElement(
      Text,
      { dimColor: true },
      result.all ? "showing project and global scopes" : "showing active scope",
    ),
    ...result.rows.flatMap((row, index) => [
      React.createElement(
        Text,
        { key: `name-${index}`, bold: true },
        `${row.name} [${row.effective}]`,
      ),
      React.createElement(
        Box,
        { key: `row-${index}`, flexDirection: "column", marginLeft: 2 },
        createDetailRow(ink, { label: "scope", value: row.scope }, `scope-${index}`),
        createDetailRow(ink, { label: "source", value: row.source }, `source-${index}`),
        createDetailRow(
          ink,
          { label: "requested", value: row.requested ?? "" },
          `requested-${index}`,
        ),
        createDetailRow(ink, { label: "resolved", value: row.resolved ?? "" }, `resolved-${index}`),
      ),
    ]),
  );
}

function createInspectView(
  ink: InkModule,
  result: Extract<CliResult, { kind: "inspect" }>,
): React.ReactNode {
  const { Box, Text } = ink;
  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, { color: "green", bold: true }, `[ok] inspect`),
    React.createElement(Text, { dimColor: true }, `scope: ${result.scope}`),
    React.createElement(Text, { bold: true }, result.name),
    ...result.details.map((detail, index) => createDetailRow(ink, detail, `inspect-${index}`)),
  );
}

function createHelpView(
  ink: InkModule,
  result: Extract<CliResult, { kind: "help" }>,
): React.ReactNode {
  const { Box, Text } = ink;
  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, { color: "green", bold: true }, result.title),
    React.createElement(Text, null, `Usage: ${result.usage}`),
    ...result.sections.flatMap((section, index) => [
      React.createElement(Text, { key: `section-title-${index}`, bold: true }, section.title),
      ...section.lines.map((line, lineIndex) =>
        React.createElement(Text, { key: `section-line-${index}-${lineIndex}` }, line),
      ),
    ]),
  );
}

function createVersionView(
  ink: InkModule,
  result: Extract<CliResult, { kind: "version" }>,
): React.ReactNode {
  const { Box, Text } = ink;
  return React.createElement(
    Box,
    { flexDirection: "column" },
    React.createElement(Text, { color: "green", bold: true }, "skm"),
    React.createElement(Text, null, result.version),
  );
}

function createSkillSummary(
  ink: InkModule,
  skill: CliSkillSummary,
  index: number,
): React.ReactNode {
  const { Box, Text } = ink;
  return React.createElement(
    Box,
    { key: `skill-${index}`, flexDirection: "column", marginLeft: 2 },
    React.createElement(
      Text,
      { bold: true },
      `${skill.name}${skill.status ? ` (${skill.status})` : ""}`,
    ),
    ...(skill.previousName
      ? [
          createDetailRow(
            ink,
            { label: "previous", value: skill.previousName },
            `previous-${index}`,
          ),
        ]
      : []),
    ...(skill.source
      ? [createDetailRow(ink, { label: "source", value: skill.source }, `skill-source-${index}`)]
      : []),
    ...(skill.requested
      ? [
          createDetailRow(
            ink,
            { label: "requested", value: skill.requested },
            `skill-requested-${index}`,
          ),
        ]
      : []),
    ...(skill.resolved
      ? [
          createDetailRow(
            ink,
            { label: "resolved", value: skill.resolved },
            `skill-resolved-${index}`,
          ),
        ]
      : []),
  );
}

function createDetailRow(ink: InkModule, detail: CliDetail, key: string): React.ReactNode {
  const { Box, Text } = ink;
  return React.createElement(
    Box,
    { key },
    React.createElement(Text, { dimColor: true }, `${detail.label}: `),
    React.createElement(Text, null, detail.value),
  );
}
