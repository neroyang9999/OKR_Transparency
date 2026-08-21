import { describe, expect, it } from "vitest";
import { applyDraftObjectiveScope, createEmptyObjective, draftToRecords, filterDraftByOwner, localizeDraftForLanguage, mergeDraftByOwner, normalizeDraft, recordsToDraft, validateDraft, withExistingLocalizedContent, type OkrDraft } from "./edit-types";

const draft: OkrDraft = {
  version: 1,
  team: "Software",
  periodId: "2026-q3",
  updatedAt: "2026-06-15T00:00:00.000Z",
  objectives: [
    {
      id: "SW-O1",
      periodId: "2026-q3",
      team: "Software",
      title: "Improve software quality",
      owner: "Software Lead",
      type: "Committed",
      confidence: "Yellow",
      weight: 100,
      progress: null,
      alignedToId: "ENG-O1",
      status: "draft",
      keyResults: [
        {
          id: "SW-O1-KR1",
          title: "Reduce escaped issues",
          owner: "Software Lead",
          baseline: "Q2 baseline",
          target: "Q3 target",
          actual: "In progress",
          progress: 50,
          confidence: "Yellow",
          weight: 100,
          risks: "Taxonomy not locked",
          decisionsNeeded: ""
        }
      ]
    }
  ]
};

const baseRecord = {
  okr_id: "",
  parent_id: "",
  level: "Team" as const,
  team: "QA Team",
  objective: "",
  kr: "",
  type: "Committed" as const,
  owner: "Xiaojun (June) Duan",
  baseline: "",
  target: "",
  actual: "",
  score: null,
  confidence: "Green" as const,
  dependencies: "",
  risks: "",
  decisions_needed: "",
  source_doc_url: "",
  last_update: "",
  objective_scope: "member" as const
};
describe("OKR edit draft helpers", () => {
  it("starts a new objective with one KR that owns the full weight", () => {
    const objective = createEmptyObjective("QA Team", "2026-q3", "QA Lead");

    expect(objective.keyResults).toHaveLength(1);
    expect(objective.keyResults[0]).toMatchObject({ owner: "QA Lead", title: "", weight: 100 });
  });

  it("leaves a new objective unaligned so the member chooses their own upper-level target", () => {
    const objective = createEmptyObjective("QA Team", "2026-q3", "QA Lead");

    expect(objective.alignedToId).toBeUndefined();
  });

  it("carries a published alignment into the draft rather than inventing one", () => {
    const aligned = recordsToDraft([
      {
        ...baseRecord,
        okr_id: "QA-M1",
        team: "QA Team",
        objective: "Member objective",
        aligned_to_id: "QA-O1"
      },
      { ...baseRecord, okr_id: "QA-M2", team: "QA Team", objective: "Unaligned member objective" }
    ], "QA Team", "2026-q3");

    expect(aligned.objectives.find((objective) => objective.id === "QA-M1")?.alignedToId).toBe("QA-O1");
    expect(aligned.objectives.find((objective) => objective.id === "QA-M2")?.alignedToId).toBeUndefined();
  });
  it("validates a complete draft", () => {
    const result = validateDraft(draft);
    expect(result.errors).toEqual([]);
  });

  it("rejects missing, duplicate, and self-aligned ids before saving", () => {
    const result = validateDraft({
      ...draft,
      objectives: [
        { ...draft.objectives[0], alignedToId: "SW-O1" },
        {
          ...draft.objectives[0],
          id: "",
          keyResults: [{ ...draft.objectives[0].keyResults[0], id: "SW-O1" }]
        }
      ]
    });

    expect(result.errors).toEqual(expect.arrayContaining([
      "O1: Objective cannot align to itself",
      "O2: id is required",
      "O2-KR1: duplicate id SW-O1"
    ]));
  });

  it("converts nested draft data to flat OKR records", () => {
    const records = draftToRecords(draft);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ okr_id: "SW-O1", parent_id: "", aligned_to_id: "ENG-O1", kr: "", score: 0.5 });
    expect(records[1]).toMatchObject({ okr_id: "SW-O1-KR1", parent_id: "SW-O1", score: 0.5 });
    expect(records[1]).not.toHaveProperty("aligned_to_id");
    expect(records[0]).toMatchObject({ objective_scope: "team" });
  });

  it("persists member scope and email on the Objective and all of its KRs", () => {
    const memberDraft = applyDraftObjectiveScope(draft, {
      objectiveScope: "member",
      ownerEmail: "MEMBER@UNITXLABS.COM"
    });
    const records = draftToRecords(memberDraft);

    expect(records).toHaveLength(2);
    expect(records.every((record) => record.objective_scope === "member")).toBe(true);
    expect(records.every((record) => record.owner_email === "member@unitxlabs.com")).toBe(true);
  });

  it("uses KR weighted progress for objective records", () => {
    const records = draftToRecords({
      ...draft,
      objectives: draft.objectives.map((objective) => ({
        ...objective,
        progress: 99,
        keyResults: [
          { ...objective.keyResults[0], progress: 20, weight: 50 },
          { ...objective.keyResults[0], id: "SW-O1-KR2", progress: 60, weight: 50 }
        ]
      }))
    });

    expect(records[0]).toMatchObject({ okr_id: "SW-O1", score: 0.4 });
  });

  it("keeps published scores within 100 percent", () => {
    const records = draftToRecords({
      ...draft,
      objectives: draft.objectives.map((objective) => ({
        ...objective,
        keyResults: [
          { ...objective.keyResults[0], progress: 200, weight: 100 },
          { ...objective.keyResults[0], id: "SW-O1-KR2", progress: 100, weight: 100 }
        ]
      }))
    });

    expect(records[0].score).toBe(1);
    expect(records[1].score).toBe(1);
    expect(records[2].score).toBe(1);
  });

  it("validates objective and KR numeric ranges", () => {
    const result = validateDraft({
      ...draft,
      objectives: draft.objectives.map((objective) => ({
        ...objective,
        progress: 120,
        weight: -1,
        keyResults: objective.keyResults.map((kr) => ({ ...kr, progress: 101, weight: Number.POSITIVE_INFINITY }))
      }))
    });

    expect(result.errors).toEqual(expect.arrayContaining([
      "O1: weight must be between 0 and 100",
      "O1: progress must be between 0 and 100",
      "O1-KR1: progress must be between 0 and 100",
      "O1-KR1: weight must be between 0 and 100"
    ]));
  });

  it("normalizes invalid draft numbers and derives owner from the selected team", () => {
    const normalized = normalizeDraft({
      ...draft,
      objectives: draft.objectives.map((objective) => ({
        ...objective,
        owner: "Someone Else",
        progress: Number.NaN,
        weight: 120,
        keyResults: objective.keyResults.map((kr) => ({ ...kr, owner: "", progress: -10, weight: 150 }))
      }))
    }, "QA Lead");

    expect(normalized.objectives[0]).toMatchObject({ owner: "QA Lead", progress: null, weight: 100 });
    expect(normalized.objectives[0].keyResults[0]).toMatchObject({ owner: "QA Lead", progress: 0, weight: 100 });
  });

  it("does not require alignment for Software top-level OKRs", () => {
    const result = validateDraft({
      ...draft,
      objectives: draft.objectives.map((objective) => ({ ...objective, alignedToId: undefined }))
    });
    expect(result.warnings.some((warning) => warning.includes("alignment"))).toBe(false);
  });

  it("warns about child-team objectives that are not aligned upward without blocking publish", () => {
    const result = validateDraft({
      ...draft,
      team: "QA Team",
      objectives: draft.objectives.map((objective) => ({ ...objective, team: "QA Team", alignedToId: undefined }))
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes("alignment"))).toBe(true);
  });

  it("keeps advanced KR details optional", () => {
    const result = validateDraft({
      ...draft,
      objectives: draft.objectives.map((objective) => ({
        ...objective,
        keyResults: objective.keyResults.map((kr) => ({ ...kr, baseline: "", target: "", risks: "", decisionsNeeded: "" }))
      }))
    });
    expect(result.errors).toEqual([]);
  });

  it("keeps bilingual content when publishing and selects it by display language", () => {
    const bilingualDraft: OkrDraft = {
      ...draft,
      objectives: draft.objectives.map((objective) => ({
        ...objective,
        titleLocalized: { zh: "提升软件质量", en: "Improve software quality", zhOrigin: "manual", enOrigin: "machine" },
        keyResults: objective.keyResults.map((kr) => ({
          ...kr,
          titleLocalized: { zh: "减少逃逸问题", en: "Reduce escaped issues", zhOrigin: "manual", enOrigin: "machine" }
        }))
      }))
    };

    expect(localizeDraftForLanguage(bilingualDraft, "zh").objectives[0].title).toBe("提升软件质量");
    expect(draftToRecords(bilingualDraft)[1].localized?.kr?.en).toBe("Reduce escaped issues");
  });

  it("reuses saved translations when the browser sends an older draft shape", () => {
    const existing = {
      ...draft,
      objectives: draft.objectives.map((objective) => ({
        ...objective,
        titleLocalized: { zh: "提升软件质量", en: "Improve software quality", zhOrigin: "manual" as const, enOrigin: "machine" as const }
      }))
    };

    expect(withExistingLocalizedContent(draft, existing).objectives[0].titleLocalized?.zh).toBe("提升软件质量");
  });

  it("merges one owner scope without overwriting another member's OKRs", () => {
    const memberObjective = {
      ...draft.objectives[0],
      id: "TPM-MEMBER-O1",
      owner: "Yang Luo",
      keyResults: draft.objectives[0].keyResults.map((kr) => ({ ...kr, id: "TPM-MEMBER-O1-KR1", owner: "Yang Luo" }))
    };
    const current = {
      ...draft,
      team: "TPM Team",
      objectives: [draft.objectives[0], memberObjective]
    };
    const teamLeadChange = {
      ...current,
      objectives: [{ ...draft.objectives[0], title: "Updated team objective" }]
    };

    const merged = mergeDraftByOwner(current, teamLeadChange, "Software Lead", ["Software Lead"]);

    expect(merged.objectives).toHaveLength(2);
    expect(merged.objectives.find((objective) => objective.id === "SW-O1")?.title).toBe("Updated team objective");
    expect(merged.objectives.find((objective) => objective.id === "TPM-MEMBER-O1")?.owner).toBe("Yang Luo");
  });

  it("does not show a member's OKR in the team lead edit scope", () => {
    const mixedDraft = {
      ...draft,
      team: "TPM Team",
      objectives: [
        draft.objectives[0],
        {
          ...draft.objectives[0],
          id: "TPM-MEMBER-O1",
          owner: "Yang Luo",
          keyResults: draft.objectives[0].keyResults.map((kr) => ({ ...kr, owner: "Yang Luo" }))
        }
      ]
    };

    const teamDraft = filterDraftByOwner(mixedDraft, ["Software Lead"], "Software Lead");

    expect(teamDraft.objectives.map((objective) => objective.id)).toEqual(["SW-O1"]);
  });

  it("keeps team and member Objectives separate even when they have the same owner", () => {
    const sameOwnerDraft: OkrDraft = {
      ...draft,
      objectives: [
        { ...draft.objectives[0], objectiveScope: "team" },
        { ...draft.objectives[0], id: "SW-MEMBER-O1", objectiveScope: "member", ownerEmail: "lead@unitxlabs.com" }
      ]
    };
    const teamScope = { objectiveScope: "team" as const };
    const memberScope = { objectiveScope: "member" as const, ownerEmail: "lead@unitxlabs.com" };

    expect(filterDraftByOwner(sameOwnerDraft, ["Software Lead"], "Software Lead", teamScope).objectives.map((objective) => objective.id)).toEqual(["SW-O1"]);
    expect(filterDraftByOwner(sameOwnerDraft, ["Software Lead"], "Software Lead", memberScope).objectives.map((objective) => objective.id)).toEqual(["SW-MEMBER-O1"]);

    const replaced = mergeDraftByOwner(
      sameOwnerDraft,
      { ...sameOwnerDraft, objectives: [{ ...sameOwnerDraft.objectives[1], title: "Refilled member Objective" }] },
      "Software Lead",
      ["Software Lead"],
      "draft",
      memberScope
    );
    expect(replaced.objectives.find((objective) => objective.id === "SW-O1")?.title).toBe("Improve software quality");
    expect(replaced.objectives.find((objective) => objective.id === "SW-MEMBER-O1")?.title).toBe("Refilled member Objective");
  });
});
