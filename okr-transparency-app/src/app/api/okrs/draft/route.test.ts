import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readAdminConfig } from "@/lib/admin/config";
import { authorizeDraftChange, resolveRequestAccess } from "@/lib/admin/permissions";
import { readDraft, writeOwnerScopedDraft } from "@/lib/okr/drafts";
import type { OkrDraft } from "@/lib/okr/edit-types";
import { PUT } from "./route";

vi.mock("@/lib/admin/api-access", () => ({ requireApiAccess: vi.fn() }));
vi.mock("@/lib/admin/config", () => ({ readAdminConfig: vi.fn() }));
vi.mock("@/lib/admin/permissions", () => ({
  authorizeDraftChange: vi.fn(),
  canEditTeamOwner: vi.fn(() => true),
  resolveRequestAccess: vi.fn()
}));
vi.mock("@/lib/okr/drafts", () => ({ readDraft: vi.fn(), writeOwnerScopedDraft: vi.fn() }));
vi.mock("@/lib/okr/edit-types", () => ({
  filterDraftByOwner: vi.fn((draft) => draft),
  normalizeDraft: vi.fn((draft) => draft),
  validateDraft: vi.fn(() => ({ errors: [], warnings: [] }))
}));
vi.mock("@/lib/okr/owner-scope", () => ({
  ownerScopeForMember: vi.fn(),
  ownerScopeForTeam: vi.fn(() => ({ owner: "TPM Lead", aliases: ["TPM Lead", "TPM Manager", "lead@unitxlabs.com"] }))
}));

const teamObjective = objective("TPM-O1", "TPM Lead");
const memberObjective = objective("TPM-YANG-O1", "Yang Luo");
const currentDraft: OkrDraft = {
  version: 1,
  team: "TPM Team",
  periodId: "2026-q3",
  updatedAt: "2026-08-10T00:00:00.000Z",
  objectives: [teamObjective, memberObjective]
};

describe("PUT /api/okrs/draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readAdminConfig).mockResolvedValue(config as never);
    vi.mocked(resolveRequestAccess).mockResolvedValue(access as never);
    vi.mocked(authorizeDraftChange).mockReturnValue({ ok: true, error: "" });
    vi.mocked(readDraft).mockResolvedValue(currentDraft);
    vi.mocked(writeOwnerScopedDraft).mockResolvedValue(currentDraft);
  });

  it("saves the team lead scope without claiming a member's OKRs", async () => {
    const response = await PUT(new NextRequest("http://localhost/api/okrs/draft", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...currentDraft, objectives: [{ ...teamObjective, title: "Updated team objective" }] })
    }));

    expect(response.status).toBe(200);
    expect(writeOwnerScopedDraft).toHaveBeenCalledWith(
      expect.objectContaining({ objectives: [expect.objectContaining({ id: "TPM-O1" })] }),
      "TPM Lead",
      expect.not.arrayContaining(["Yang Luo"])
    );
  });
});

function objective(id: string, owner: string): OkrDraft["objectives"][number] {
  return {
    id,
    periodId: "2026-q3",
    team: "TPM Team",
    title: `${owner} objective`,
    owner,
    type: "Committed",
    confidence: "Yellow",
    weight: 100,
    progress: 20,
    alignedToId: "SW-O1",
    status: "draft",
    keyResults: [{
      id: `${id}-KR1`,
      title: "Result",
      owner,
      baseline: "",
      target: "",
      actual: "",
      progress: 20,
      confidence: "Yellow",
      weight: 100,
      risks: "",
      decisionsNeeded: ""
    }]
  };
}

const config = {
  periods: [{ id: "2026-q3", status: "active" }],
  teams: [{ id: "tpm", name: "TPM Team", owner: "TPM Lead", parentTeam: "Software", color: "blue", enabled: true }],
  users: [
    { email: "lead@unitxlabs.com", displayName: "TPM Manager", role: "team_leader", teams: ["TPM Team"], ownerAliases: ["TPM Lead"], enabled: true },
    { email: "yang.luo@unitxlabs.com", displayName: "Yang Luo", role: "user", teams: ["TPM Team"], ownerAliases: ["Yang Luo"], enabled: true }
  ]
};

const access = {
  email: "lead@unitxlabs.com",
  displayName: "TPM Manager",
  role: "team_leader",
  teams: ["TPM Team"],
  ownerAliases: ["TPM Lead"],
  source: "google"
};
