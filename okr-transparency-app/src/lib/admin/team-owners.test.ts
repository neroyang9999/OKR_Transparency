import { describe, expect, it } from "vitest";
import type { AdminUser } from "./config";
import { resolveTeamOwner, selectableTeamOwners } from "./team-owners";

const users: AdminUser[] = [
  { email: "xiaojun@unitxlabs.com", displayName: "Xiaojun Duan", role: "team_leader", teams: ["QA Team"], ownerAliases: [], enabled: true },
  { email: "admin@unitxlabs.com", displayName: "Admin", role: "super_admin", teams: [], leaderTeams: ["Software"], ownerAliases: [], enabled: true },
  { email: "new-user-3@company.com", displayName: "新成员", role: "user", teams: ["QA Team"], ownerAliases: [], enabled: true },
  { email: "disabled@unitxlabs.com", displayName: "Disabled User", role: "user", teams: ["QA Team"], ownerAliases: [], enabled: false }
];

describe("team owners", () => {
  it("only offers enabled users with a complete real identity", () => {
    expect(selectableTeamOwners(users).map((user) => user.displayName)).toEqual(["Xiaojun Duan", "Admin"]);
  });

  it("replaces a legacy lead alias with the configured team leader", () => {
    expect(resolveTeamOwner(users, { name: "QA Team", owner: "QA Lead" })?.displayName).toBe("Xiaojun Duan");
    expect(resolveTeamOwner(users, { name: "Software", owner: "Software Lead" })?.displayName).toBe("Admin");
  });
});
