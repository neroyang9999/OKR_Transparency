import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses quoted fields and required headers", () => {
    const rows = parseCsv(`okr_id,parent_id,level,team,objective,kr,type,owner,baseline,target,actual,score,confidence,dependencies,risks,decisions_needed,source_doc_url,last_update
"ENG-O1","",Engineering,Engineering,"Objective, with comma","",Committed,Alice,base,target,,0.5,Yellow,dep,risk,decision,https://example.com,2026-06-10`);

    expect(rows).toHaveLength(1);
    expect(rows[0].objective).toBe("Objective, with comma");
    expect(rows[0].okr_id).toBe("ENG-O1");
  });

  it("fails when required headers are missing", () => {
    expect(() => parseCsv("okr_id,parent_id\nA,")).toThrow("Missing required headers");
  });
});
