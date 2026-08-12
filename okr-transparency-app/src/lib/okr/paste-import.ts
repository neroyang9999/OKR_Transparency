import { createEmptyKr, createEmptyObjective, type DraftObjectiveScope, type OkrDraft } from "./edit-types";

export type PastedOkrObjective = {
  title: string;
  keyResults: string[];
};

export type PastedOkrParseResult = {
  objectives: PastedOkrObjective[];
  ignoredLines: string[];
};

export type PastedOkrApplyMode = "append" | "replace";

const objectivePattern = /^O(?:BJECTIVE)?\s*\d+\s*[:：.\-]\s*(.*)$/i;
const keyResultPattern = /^KR\s*\d+\s*[:：.\-]\s*(.*)$/i;
const bulletPattern = /^[•●▪◦‣⁃*-]\s+(.*)$/;

export function parsePastedOkrs(input: string): PastedOkrParseResult {
  const objectives: PastedOkrObjective[] = [];
  const ignoredLines: string[] = [];
  let currentObjective: PastedOkrObjective | undefined;
  let currentField: { kind: "objective" } | { kind: "kr"; index: number } | undefined;

  for (const rawLine of input.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const withoutBullet = stripBullet(line);
    const objectiveMatch = withoutBullet.match(objectivePattern);
    if (objectiveMatch) {
      currentObjective = { title: objectiveMatch[1].trim(), keyResults: [] };
      objectives.push(currentObjective);
      currentField = { kind: "objective" };
      continue;
    }

    const keyResultMatch = withoutBullet.match(keyResultPattern);
    if (keyResultMatch) {
      if (!currentObjective) {
        ignoredLines.push(line);
        currentField = undefined;
        continue;
      }
      currentObjective.keyResults.push(keyResultMatch[1].trim());
      currentField = { kind: "kr", index: currentObjective.keyResults.length - 1 };
      continue;
    }

    const bulletMatch = line.match(bulletPattern);
    if (bulletMatch && currentObjective) {
      currentObjective.keyResults.push(bulletMatch[1].trim());
      currentField = { kind: "kr", index: currentObjective.keyResults.length - 1 };
      continue;
    }

    if (!currentObjective || !currentField) {
      ignoredLines.push(line);
      continue;
    }

    if (currentField.kind === "objective") {
      currentObjective.title = joinText(currentObjective.title, line);
    } else {
      currentObjective.keyResults[currentField.index] = joinText(
        currentObjective.keyResults[currentField.index],
        line
      );
    }
  }

  return { objectives, ignoredLines };
}

export function applyPastedOkrs(
  draft: OkrDraft,
  pastedObjectives: PastedOkrObjective[],
  owner: string,
  mode: PastedOkrApplyMode,
  idSeed = Date.now().toString(36).toUpperCase(),
  scope: DraftObjectiveScope = { objectiveScope: "team" }
): OkrDraft {
  const imported = pastedObjectives.map((pastedObjective, objectiveIndex) => {
    const generated = createEmptyObjective(draft.team, draft.periodId, owner);
    const objectiveId = `${draftIdPrefix(draft.team)}-PASTE-${idSeed}-O${objectiveIndex + 1}`;
    const keyResultCount = pastedObjective.keyResults.length;

    return {
      ...generated,
      ...scope,
      id: objectiveId,
      title: pastedObjective.title.trim(),
      keyResults: pastedObjective.keyResults.map((title, krIndex) => ({
        ...createEmptyKr(objectiveId, krIndex, owner, keyResultCount),
        id: `${objectiveId}-KR${krIndex + 1}`,
        title: title.trim()
      }))
    };
  });

  return {
    ...draft,
    updatedAt: new Date().toISOString(),
    objectives: mode === "replace" ? imported : [...draft.objectives, ...imported]
  };
}

function stripBullet(value: string) {
  return value.replace(/^[•●▪◦‣⁃*-]\s+/, "");
}

function joinText(current: string, continuation: string) {
  return [current.trim(), continuation.trim()].filter(Boolean).join(" ");
}

function draftIdPrefix(team: string) {
  return team.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "OKR";
}
