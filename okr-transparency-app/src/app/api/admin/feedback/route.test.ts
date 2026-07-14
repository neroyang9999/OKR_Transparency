import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readAdminConfig } from "@/lib/admin/config";
import { canManageAdmin, resolveRequestAccess } from "@/lib/admin/permissions";
import { readUserFeedback } from "@/lib/feedback";
import { GET } from "./route";

vi.mock("@/lib/admin/config", () => ({ readAdminConfig: vi.fn() }));
vi.mock("@/lib/admin/permissions", () => ({ canManageAdmin: vi.fn(), resolveRequestAccess: vi.fn() }));
vi.mock("@/lib/feedback", () => ({ readUserFeedback: vi.fn() }));

describe("GET /api/admin/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readAdminConfig).mockResolvedValue({} as never);
    vi.mocked(resolveRequestAccess).mockResolvedValue(null);
    vi.mocked(canManageAdmin).mockReturnValue(false);
  });

  it("requires a system administrator", async () => {
    const response = await GET(new NextRequest("http://localhost/api/admin/feedback"));

    expect(response.status).toBe(401);
    expect(readUserFeedback).not.toHaveBeenCalled();
  });

  it("returns feedback to a system administrator", async () => {
    vi.mocked(canManageAdmin).mockReturnValueOnce(true);
    vi.mocked(readUserFeedback).mockResolvedValueOnce([{
      id: "feedback-1",
      message: "Great app",
      page: "/",
      userEmail: "member@company.com",
      userName: "Team Member",
      createdAt: "2026-07-14T08:00:00.000Z"
    }]);

    const response = await GET(new NextRequest("http://localhost/api/admin/feedback"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ feedback: [expect.objectContaining({ message: "Great app" })] });
  });
});
