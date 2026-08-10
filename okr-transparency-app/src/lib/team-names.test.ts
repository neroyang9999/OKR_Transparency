import { describe, expect, it } from "vitest";
import { canonicalOwnerName, canonicalTeamName, legacyTeamNamesFor } from "./team-names";

describe("team name compatibility", () => {
  it("maps legacy team and leader labels while preserving unrelated names", () => {
    expect(canonicalTeamName("Integration Team")).toBe("System Team");
    expect(canonicalTeamName("Platform Team")).toBe("Infra Team");
    expect(canonicalTeamName("QA Team")).toBe("QA Team");
    expect(canonicalOwnerName("Integration Lead")).toBe("System Leader");
    expect(canonicalOwnerName("Platform Lead")).toBe("Infra Leader");
  });

  it("finds legacy draft keys for renamed teams", () => {
    expect(legacyTeamNamesFor("System Team")).toEqual(["Integration Team"]);
    expect(legacyTeamNamesFor("Infra Team")).toEqual(["Platform Team"]);
  });
});
