import { describe, expect, it } from "vitest";
import { applyPastedOkrs, parsePastedOkrs } from "./paste-import";
import type { OkrDraft } from "./edit-types";

const sourceText = `
Software

O1: Improve the quality of the main EOL software branch and the capability to close critical stability issues
• KR1: Limit post-site escaped P0/P1/P2 defects of EOL software releases to ≤2/3/5 per release [Xiaojun]
• KR2: Deliver high quality workflow revamp: Implement 80% P0/P1 E2E automated tests [Kai]
• KR3: 80% root cause fix IPC freeze-related P0/P1 issues. [Qiaolong]

O2: Boost the scalable delivery capacity and cost efficiency of the EOL Platform
• KR1: Pass UAT with no-code workflow in EOL with Advanced thresholding logic. [Yuanhang]
• KR2: Cut the average BOM cost of IPC under standard EOL by ≥12% / ≥$460 per unit average
and validate 5080→5070 downgrade support for ~$500/unit future cost avoidance. [Xinyang]
• KR3: Access all key operational indicators and deploy to 5 key projects. [Qiaolong]

O3: Establish a full launch pipeline for Smart Camera from engineering prototypes to sellable, deliverable
products [Yuanhang]
• KR1: Complete end-to-end deployment validation of Smart Camera at 3 target customer sites
• KR2: Deployment-related P0 issues limited to ≤ 1 per version release.
• KR3: Deliver template matching and dimension measurement algorithms with 100% parity success rate.
`;

const emptyDraft: OkrDraft = {
  version: 1,
  team: "Software",
  periodId: "2026-q3",
  updatedAt: "2026-08-12T00:00:00.000Z",
  objectives: []
};

describe("pasted OKR import", () => {
  it("parses wrapped Objective and KR text while preserving owner annotations", () => {
    const result = parsePastedOkrs(sourceText);

    expect(result.objectives).toHaveLength(3);
    expect(result.objectives.flatMap((objective) => objective.keyResults)).toHaveLength(9);
    expect(result.ignoredLines).toEqual(["Software"]);
    expect(result.objectives[0].keyResults[0]).toContain("[Xiaojun]");
    expect(result.objectives[1].keyResults[1]).toContain("~$500/unit future cost avoidance. [Xinyang]");
    expect(result.objectives[2].title).toContain("products [Yuanhang]");
  });

  it("creates blank progress and detail fields with evenly distributed weights", () => {
    const parsed = parsePastedOkrs(sourceText);
    const result = applyPastedOkrs(emptyDraft, parsed.objectives, "Software Lead", "append", "TEST");
    const firstObjective = result.objectives[0];

    expect(firstObjective).toMatchObject({
      id: "SOFTWARE-PASTE-TEST-O1",
      owner: "Software Lead",
      progress: null,
      type: "Committed",
      confidence: "Yellow"
    });
    expect(firstObjective.keyResults.map((kr) => kr.weight)).toEqual([33.3, 33.3, 33.4]);
    expect(firstObjective.keyResults[0]).toMatchObject({
      owner: "Software Lead",
      baseline: "",
      target: "",
      actual: "",
      progress: null,
      risks: "",
      decisionsNeeded: ""
    });
  });

  it("keeps the current member scope on imported Objectives", () => {
    const result = applyPastedOkrs(
      emptyDraft,
      [{ title: "Imported", keyResults: ["Imported KR"] }],
      "Nero Yang",
      "append",
      "TEST",
      { objectiveScope: "member", ownerEmail: "nero@example.com" }
    );

    expect(result.objectives[0]).toMatchObject({ objectiveScope: "member", ownerEmail: "nero@example.com" });
  });

  it("appends by default and only replaces when explicitly requested", () => {
    const existing = applyPastedOkrs(emptyDraft, [{ title: "Existing", keyResults: ["Existing KR"] }], "Software Lead", "append", "OLD");
    const next = [{ title: "Imported", keyResults: ["Imported KR"] }];

    expect(applyPastedOkrs(existing, next, "Software Lead", "append", "NEW").objectives.map((objective) => objective.title)).toEqual(["Existing", "Imported"]);
    expect(applyPastedOkrs(existing, next, "Software Lead", "replace", "NEW").objectives.map((objective) => objective.title)).toEqual(["Imported"]);
  });
});
