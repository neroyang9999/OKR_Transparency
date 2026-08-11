import { describe, expect, it } from "vitest";
import type { AdminConfig } from "@/lib/admin/config";
import { ownerScopeForMember, ownerScopeForTeam } from "./owner-scope";

const config = {
  teams: [
    { id: "tpm", name: "TPM Team", owner: "TPM Lead", parentTeam: "Software", color: "blue", enabled: true }
  ],
  users: [
    { email: "lead@unitxlabs.com", displayName: "Team Leader", role: "team_leader", teams: ["TPM Team"], ownerAliases: ["TPM Lead"], enabled: true },
    { email: "yang.luo@unitxlabs.com", displayName: "Yang Luo", role: "user", teams: ["TPM Team"], ownerAliases: ["Yang Luo"], enabled: true }
  ]
} as AdminConfig;

describe("OKR owner scopes", () => {
  it("uses the real team leader while retaining the legacy owner alias", () => {
    const scope = ownerScopeForTeam(config, "TPM Team");

    expect(scope?.owner).toBe("Team Leader");
    expect(scope?.objectiveScope).toBe("team");
    expect(scope?.aliases).toEqual(expect.arrayContaining(["TPM Lead", "Team Leader", "lead@unitxlabs.com"]));
    expect(scope?.aliases).not.toContain("Yang Luo");
  });

  it("resolves a member only inside the configured team", () => {
    expect(ownerScopeForMember(config, "TPM Team", "YANG.LUO@UNITXLABS.COM")).toEqual({
      owner: "Yang Luo",
      aliases: ["Yang Luo", "yang.luo@unitxlabs.com"],
      objectiveScope: "member",
      ownerEmail: "yang.luo@unitxlabs.com"
    });
    expect(ownerScopeForMember(config, "QA Team", "yang.luo@unitxlabs.com")).toBeNull();
  });
});
