import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireApiAccess } from "@/lib/admin/api-access";
import { appendUserFeedback, validateFeedbackInput } from "@/lib/feedback";
import { POST } from "./route";

vi.mock("@/lib/admin/api-access", () => ({ requireApiAccess: vi.fn() }));
vi.mock("@/lib/feedback", () => ({ appendUserFeedback: vi.fn(), validateFeedbackInput: vi.fn() }));

const access = {
  email: "member@company.com",
  displayName: "Team Member",
  role: "user" as const,
  teams: ["Software"],
  ownerAliases: ["Team Member"],
  source: "google" as const
};

describe("POST /api/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireApiAccess).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Login required" }, { status: 401 })
    });
    vi.mocked(validateFeedbackInput).mockReturnValue({
      ok: true,
      value: { message: "Please add a filter", page: "/teams?lang=en" }
    });
  });

  it("rejects unauthenticated submissions", async () => {
    const response = await POST(new NextRequest("http://localhost/api/feedback", {
      method: "POST",
      body: JSON.stringify({ message: "Please add a filter" })
    }));

    expect(response.status).toBe(401);
    expect(appendUserFeedback).not.toHaveBeenCalled();
  });

  it("rejects empty feedback", async () => {
    vi.mocked(requireApiAccess).mockResolvedValueOnce({ ok: true, config: {} as never, access });
    vi.mocked(validateFeedbackInput).mockReturnValueOnce({ ok: false, error: "Feedback is required" });
    const response = await POST(new NextRequest("http://localhost/api/feedback", {
      method: "POST",
      body: JSON.stringify({ message: "   ", page: "/teams" })
    }));

    expect(response.status).toBe(400);
    expect(appendUserFeedback).not.toHaveBeenCalled();
  });

  it("records feedback with the authenticated user and page context", async () => {
    vi.mocked(requireApiAccess).mockResolvedValueOnce({ ok: true, config: {} as never, access });
    vi.mocked(appendUserFeedback).mockResolvedValueOnce({
      id: "feedback-1",
      message: "Please add a filter",
      page: "/teams?lang=en",
      userEmail: access.email,
      userName: access.displayName,
      createdAt: "2026-07-14T08:00:00.000Z"
    });

    const response = await POST(new NextRequest("http://localhost/api/feedback", {
      method: "POST",
      body: JSON.stringify({ message: "  Please add a filter  ", page: "/teams?lang=en" })
    }));

    expect(response.status).toBe(201);
    expect(appendUserFeedback).toHaveBeenCalledWith(
      { message: "Please add a filter", page: "/teams?lang=en" },
      { email: access.email, displayName: access.displayName }
    );
  });
});
