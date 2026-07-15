import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendAdminEvent, readAdminConfig } from "@/lib/admin/config";
import { canManageAdmin, resolveRequestAccess } from "@/lib/admin/permissions";
import { deleteUserFeedback, updateUserFeedbackStatus } from "@/lib/feedback";
import { DELETE, PATCH } from "./route";

vi.mock("@/lib/admin/config", () => ({ appendAdminEvent: vi.fn(), readAdminConfig: vi.fn() }));
vi.mock("@/lib/admin/permissions", () => ({ canManageAdmin: vi.fn(), resolveRequestAccess: vi.fn() }));
vi.mock("@/lib/feedback", () => ({ deleteUserFeedback: vi.fn(), updateUserFeedbackStatus: vi.fn() }));

const access = {
  email: "admin@company.com",
  displayName: "Admin",
  role: "super_admin" as const,
  teams: [],
  ownerAliases: ["Admin"],
  source: "iap" as const
};
const context = { params: Promise.resolve({ id: "feedback-1" }) };

describe("/api/admin/feedback/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readAdminConfig).mockResolvedValue({} as never);
    vi.mocked(resolveRequestAccess).mockResolvedValue(null);
    vi.mocked(canManageAdmin).mockReturnValue(false);
  });

  it("requires a system administrator", async () => {
    const response = await PATCH(new NextRequest("http://localhost/api/admin/feedback/feedback-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" })
    }), context);

    expect(response.status).toBe(401);
    expect(updateUserFeedbackStatus).not.toHaveBeenCalled();
  });

  it("rejects an invalid status", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValueOnce(access);
    vi.mocked(canManageAdmin).mockReturnValueOnce(true);
    const response = await PATCH(new NextRequest("http://localhost/api/admin/feedback/feedback-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "archived" })
    }), context);

    expect(response.status).toBe(400);
    expect(updateUserFeedbackStatus).not.toHaveBeenCalled();
  });

  it("marks feedback as completed and records the action", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValueOnce(access);
    vi.mocked(canManageAdmin).mockReturnValueOnce(true);
    vi.mocked(updateUserFeedbackStatus).mockResolvedValueOnce({
      id: "feedback-1",
      message: "Please add filters",
      page: "/teams",
      userEmail: "member@company.com",
      userName: "Team Member",
      createdAt: "2026-07-14T08:00:00.000Z",
      status: "completed",
      completedAt: "2026-07-15T08:00:00.000Z",
      completedBy: "Admin"
    });

    const response = await PATCH(new NextRequest("http://localhost/api/admin/feedback/feedback-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" })
    }), context);

    expect(response.status).toBe(200);
    expect(updateUserFeedbackStatus).toHaveBeenCalledWith("feedback-1", "completed", "Admin");
    expect(appendAdminEvent).toHaveBeenCalledWith(expect.objectContaining({ message: "Completed feedback feedback-1" }));
  });

  it("returns not found for a missing feedback record", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValueOnce(access);
    vi.mocked(canManageAdmin).mockReturnValueOnce(true);
    vi.mocked(deleteUserFeedback).mockResolvedValueOnce(false);

    const response = await DELETE(new NextRequest("http://localhost/api/admin/feedback/feedback-1", { method: "DELETE" }), context);

    expect(response.status).toBe(404);
    expect(appendAdminEvent).not.toHaveBeenCalled();
  });

  it("deletes feedback and records the action", async () => {
    vi.mocked(resolveRequestAccess).mockResolvedValueOnce(access);
    vi.mocked(canManageAdmin).mockReturnValueOnce(true);
    vi.mocked(deleteUserFeedback).mockResolvedValueOnce(true);

    const response = await DELETE(new NextRequest("http://localhost/api/admin/feedback/feedback-1", { method: "DELETE" }), context);

    expect(response.status).toBe(200);
    expect(deleteUserFeedback).toHaveBeenCalledWith("feedback-1");
    expect(appendAdminEvent).toHaveBeenCalledWith(expect.objectContaining({ message: "Deleted feedback feedback-1" }));
  });
});
