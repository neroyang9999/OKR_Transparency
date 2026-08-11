import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendAdminEvent, readAdminConfig } from "@/lib/admin/config";
import { authorizePublish, resolveRequestAccess } from "@/lib/admin/permissions";
import { publishDraft } from "@/lib/okr/drafts";
import { POST } from "./route";

vi.mock("@/lib/admin/config", () => ({ appendAdminEvent: vi.fn(), readAdminConfig: vi.fn() }));
vi.mock("@/lib/admin/permissions", () => ({
  authorizePublish: vi.fn(),
  getTeamEditPolicy: vi.fn(),
  resolveRequestAccess: vi.fn(),
  validateEditablePeriod: vi.fn()
}));
vi.mock("@/lib/okr/drafts", () => ({ publishDraft: vi.fn() }));
vi.mock("@/lib/okr/owner-scope", () => ({
  ownerScopeForMember: vi.fn(),
  ownerScopeForTeam: vi.fn(() => ({ owner: "TPM Lead", aliases: ["TPM Lead", "TPM Manager", "lead@unitxlabs.com"], objectiveScope: "team" }))
}));
vi.mock("@/lib/okr/store", () => ({ SnapshotConflictError: class SnapshotConflictError extends Error {} }));

describe("POST /api/okrs/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readAdminConfig).mockResolvedValue(config as never);
    vi.mocked(resolveRequestAccess).mockResolvedValue(access as never);
    vi.mocked(authorizePublish).mockReturnValue({ ok: true, error: "" });
    vi.mocked(publishDraft).mockResolvedValue({ snapshot: { version: 1, meta: {} as never, records: [] }, errors: [], warnings: [] });
    vi.mocked(appendAdminEvent).mockResolvedValue(undefined);
  });

  it("publishes only the team lead owner scope when no member is selected", async () => {
    const response = await POST(new NextRequest("http://localhost/api/okrs/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ team: "TPM Team", periodId: "2026-q3" })
    }));

    expect(response.status).toBe(200);
    expect(publishDraft).toHaveBeenCalledWith(
      "TPM Team",
      "2026-q3",
      "TPM Lead",
      expect.objectContaining({ owner: "TPM Lead", aliases: expect.not.arrayContaining(["Yang Luo"]) }),
      "TPM Manager"
    );
  });
});

const config = {
  defaultPeriodId: "2026-q3",
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
