import { describe, expect, it } from "vitest";
import type { AdminUser } from "./config";
import { filterAdminUsers } from "./user-filter";

const users: AdminUser[] = [
  { email: "admin@company.com", displayName: "Admin", role: "super_admin", teams: ["TPM Team"], leaderTeams: ["TPM Team"], ownerAliases: [], enabled: true },
  { email: "lead@company.com", displayName: "Team Lead", role: "team_leader", teams: ["Software"], ownerAliases: [], enabled: true },
  { email: "member@company.com", displayName: "Yang Luo", role: "user", teams: ["TPM Team"], ownerAliases: [], enabled: true }
];

describe("admin member filters", () => {
  it("switches role categories before applying search", () => {
    expect(filterAdminUsers(users, "super_admin", "").map(({ user }) => user.email)).toEqual(["admin@company.com"]);
    expect(filterAdminUsers(users, "team_leader", "").map(({ user }) => user.email)).toEqual(["admin@company.com", "lead@company.com"]);
    expect(filterAdminUsers(users, "team_leader", "tpm").map(({ user }) => user.email)).toEqual(["admin@company.com"]);
    expect(filterAdminUsers(users, "team_leader", "software").map(({ user }) => user.email)).toEqual(["lead@company.com"]);
    expect(filterAdminUsers(users, "user", "yang").map(({ user }) => user.email)).toEqual(["member@company.com"]);
    expect(filterAdminUsers(users, "user", "admin")).toEqual([]);
  });
});
