import { describe, expect, it } from "vitest";
import { normalizeAdminConfig } from "./config";
import { adminTeamNameCandidates, renameAdminTeam, resolveAdminTeamName } from "./team-rename";

describe("team rename", () => {
  const defaultAdminConfig = () => normalizeAdminConfig({});
  it("renames organization references while retaining the old name as an alias", () => {
    const config = defaultAdminConfig();
    const parent = config.teams.find((team) => team.name === "Software")!;
    const renamed = renameAdminTeam(config, parent.id, "Engineering");

    expect(renamed.defaultTeam).toBe("Engineering");
    expect(renamed.teams.find((team) => team.id === parent.id)).toMatchObject({
      name: "Engineering",
      aliases: ["Software"]
    });
    expect(renamed.teams.filter((team) => team.parentTeam === "Engineering")).not.toHaveLength(0);
    expect(renamed.users.find((user) => user.email === "software-lead@company.com")?.teams).toContain("Engineering");
    expect(config.defaultTeam).toBe("Software");
  });

  it("keeps aliases across repeated renames and resolves historical names", () => {
    const first = renameAdminTeam(defaultAdminConfig(), "software", "Engineering");
    const second = renameAdminTeam(first, "software", "Product Engineering");

    expect(second.teams.find((team) => team.id === "software")?.aliases).toEqual(["Software", "Engineering"]);
    expect(resolveAdminTeamName(second, "Software")).toBe("Product Engineering");
    expect(resolveAdminTeamName(second, "Engineering")).toBe("Product Engineering");
    expect(adminTeamNameCandidates(second, "Product Engineering")).toEqual(["Product Engineering", "Software", "Engineering"]);
  });

  it("rejects blank names and names owned by another team", () => {
    const config = defaultAdminConfig();

    expect(() => renameAdminTeam(config, "software", "  ")).toThrow("团队名称不能为空");
    expect(() => renameAdminTeam(config, "software", "Hardware")).toThrow("团队名称已存在");
    expect(() => renameAdminTeam(config, "software", "Integration Team")).toThrow("团队名称已存在");
  });
});
