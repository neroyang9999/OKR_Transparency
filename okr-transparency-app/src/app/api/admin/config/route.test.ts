import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminConfig } from "@/lib/admin/config";
import { readAdminConfig, writeAdminConfig } from "@/lib/admin/config";
import { resolveRequestAccess } from "@/lib/admin/permissions";
import { GET, PUT } from "./route";

vi.mock("@/lib/admin/config", () => ({
  readAdminConfig: vi.fn(),
  writeAdminConfig: vi.fn(async (config: AdminConfig) => config)
}));

vi.mock("@/lib/admin/permissions", () => {
  return {
    resolveRequestAccess: vi.fn(),
    canManageAdmin: vi.fn((access) => access?.role === "super_admin")
  };
});

const baseConfig: AdminConfig = {
  version: 1,
  defaultPeriodId: "2026-q3",
  periods: [
    { id: "2026-q3", label: "Q3", labelEn: "Q3", shortLabel: "Q3", editable: true, locked: false }
  ],
  defaultTeam: "Software",
  teams: [
    { name: "Software", owner: "Software Lead", parentTeam: "", color: "bg-blue-500", enabled: true },
    { name: "Application Team", owner: "Application Lead", parentTeam: "Software", color: "bg-blue-500", enabled: true }
  ],
  permissions: [
    { team: "Software", accounts: "lead@company.com", canEdit: true, canPublish: true, notes: "" }
  ],
  users: [
    { email: "admin@company.com", displayName: "Admin", role: "super_admin", teams: [], ownerAliases: ["Admin"], enabled: true },
    { email: "lead@company.com", displayName: "Software Lead", role: "team_leader", teams: ["Software"], ownerAliases: ["Software Lead"], enabled: true },
    { email: "member@company.com", displayName: "Member", role: "user", teams: ["Software"], ownerAliases: ["Member"], enabled: true }
  ],
  settings: {
    defaultLanguage: "zh",
    showEditLinks: true,
    allowProgressNotes: true,
    backupExportEnabled: true
  }
};

const adminAccess = {
  email: "admin@company.com",
  displayName: "Admin",
  role: "super_admin" as const,
  teams: [],
  ownerAliases: ["Admin"],
  source: "google" as const
};

const teamleadAccess = {
  email: "lead@company.com",
  displayName: "Software Lead",
  role: "team_leader" as const,
  teams: ["Software"],
  ownerAliases: ["Software Lead"],
  source: "google" as const
};

const userAccess = {
  email: "member@company.com",
  displayName: "Member",
  role: "user" as const,
  teams: ["Software"],
  ownerAliases: ["Member"],
  source: "google" as const
};

describe("/api/admin/config account management permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readAdminConfig).mockResolvedValue(structuredClone(baseConfig));
    vi.mocked(writeAdminConfig).mockImplementation(async (config: AdminConfig) => config);
  });

  it("allows admin accounts to read account and permission configuration", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValueOnce(adminAccess);

    const response = await GET(new NextRequest("http://localhost/api/admin/config"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      config: expect.objectContaining({
        users: expect.arrayContaining([
          expect.objectContaining({ email: "admin@company.com", role: "super_admin" }),
          expect.objectContaining({ email: "lead@company.com", role: "team_leader" }),
          expect.objectContaining({ email: "member@company.com", role: "user" })
        ])
      })
    });
  });

  it("rejects teamlead and personal accounts from reading admin configuration", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValueOnce(teamleadAccess);
    const teamleadResponse = await GET(new NextRequest("http://localhost/api/admin/config"));

    vi.mocked(resolveRequestAccess).mockResolvedValueOnce(userAccess);
    const userResponse = await GET(new NextRequest("http://localhost/api/admin/config"));

    expect(teamleadResponse.status).toBe(401);
    await expect(teamleadResponse.json()).resolves.toEqual({ error: "Admin session required" });
    expect(userResponse.status).toBe(401);
    await expect(userResponse.json()).resolves.toEqual({ error: "Admin session required" });
  });

  it("allows admin accounts to add users and assign teamlead permissions", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValueOnce(adminAccess);
    const nextConfig: AdminConfig = {
      ...baseConfig,
      users: [
        ...baseConfig.users,
        {
          email: "newlead@company.com",
          displayName: "New Team Lead",
          role: "team_leader",
          teams: ["Application Team"],
          ownerAliases: ["New Team Lead", "newlead@company.com"],
          enabled: true
        }
      ]
    };

    const response = await PUT(new NextRequest("http://localhost/api/admin/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nextConfig)
    }));

    expect(response.status).toBe(200);
    expect(writeAdminConfig).toHaveBeenCalledWith(expect.objectContaining({
      users: expect.arrayContaining([
        expect.objectContaining({
          email: "newlead@company.com",
          role: "team_leader",
          teams: ["Application Team"],
          ownerAliases: ["New Team Lead", "newlead@company.com"],
          enabled: true
        })
      ])
    }), "Admin");
    await expect(response.json()).resolves.toEqual({
      config: expect.objectContaining({
        users: expect.arrayContaining([
          expect.objectContaining({ email: "newlead@company.com", role: "team_leader" })
        ])
      })
    });
  });

  it("allows admin accounts to change a user's role, teams, and owner aliases", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValueOnce(adminAccess);
    const nextConfig: AdminConfig = {
      ...baseConfig,
      users: baseConfig.users.map((user) =>
        user.email === "member@company.com"
          ? {
              ...user,
              role: "team_leader",
              teams: ["Software", "Application Team"],
              ownerAliases: ["Member", "member@company.com", "Application Lead"]
            }
          : user
      )
    };

    const response = await PUT(new NextRequest("http://localhost/api/admin/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nextConfig)
    }));

    expect(response.status).toBe(200);
    expect(writeAdminConfig).toHaveBeenCalledWith(expect.objectContaining({
      users: expect.arrayContaining([
        expect.objectContaining({
          email: "member@company.com",
          role: "team_leader",
          teams: ["Software", "Application Team"],
          ownerAliases: ["Member", "member@company.com", "Application Lead"]
        })
      ])
    }), "Admin");
  });

  it("rejects teamlead and personal accounts from adding or changing accounts", async () => {
    const nextConfig: AdminConfig = {
      ...baseConfig,
      users: [
        ...baseConfig.users,
        {
          email: "newuser@company.com",
          displayName: "New User",
          role: "user",
          teams: ["Software"],
          ownerAliases: ["New User"],
          enabled: true
        }
      ]
    };

    vi.mocked(resolveRequestAccess).mockResolvedValueOnce(teamleadAccess);
    const teamleadResponse = await PUT(new NextRequest("http://localhost/api/admin/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nextConfig)
    }));

    vi.mocked(resolveRequestAccess).mockResolvedValueOnce(userAccess);
    const userResponse = await PUT(new NextRequest("http://localhost/api/admin/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nextConfig)
    }));

    expect(teamleadResponse.status).toBe(401);
    await expect(teamleadResponse.json()).resolves.toEqual({ error: "Admin session required" });
    expect(userResponse.status).toBe(401);
    await expect(userResponse.json()).resolves.toEqual({ error: "Admin session required" });
    expect(writeAdminConfig).not.toHaveBeenCalled();
  });
});
