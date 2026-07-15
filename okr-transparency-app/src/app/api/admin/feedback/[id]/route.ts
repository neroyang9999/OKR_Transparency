import { NextResponse, type NextRequest } from "next/server";
import { appendAdminEvent, readAdminConfig } from "@/lib/admin/config";
import { canManageAdmin, resolveRequestAccess } from "@/lib/admin/permissions";
import { deleteUserFeedback, updateUserFeedbackStatus, type FeedbackStatus } from "@/lib/feedback";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authorization = await authorizeFeedbackAdmin(request);
  if (!authorization.ok) return authorization.response;

  let body: { status?: unknown };
  try {
    body = await request.json() as { status?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.status !== "open" && body.status !== "completed") {
    return NextResponse.json({ error: "status must be open or completed" }, { status: 400 });
  }

  const { id } = await context.params;
  const feedbackId = decodeURIComponent(id);
  const status = body.status as FeedbackStatus;

  try {
    const feedback = await updateUserFeedbackStatus(feedbackId, status, authorization.access.displayName);
    if (!feedback) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });

    await appendAdminEvent({
      type: "config.update",
      actor: authorization.access.displayName,
      status: "ok",
      message: `${status === "completed" ? "Completed" : "Reopened"} feedback ${feedbackId}`
    });
    return NextResponse.json({ feedback });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Feedback update failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const authorization = await authorizeFeedbackAdmin(request);
  if (!authorization.ok) return authorization.response;

  const { id } = await context.params;
  const feedbackId = decodeURIComponent(id);

  try {
    const deleted = await deleteUserFeedback(feedbackId);
    if (!deleted) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });

    await appendAdminEvent({
      type: "config.update",
      actor: authorization.access.displayName,
      status: "ok",
      message: `Deleted feedback ${feedbackId}`
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Feedback deletion failed" },
      { status: 500 }
    );
  }
}

async function authorizeFeedbackAdmin(request: NextRequest) {
  const config = await readAdminConfig();
  const access = await resolveRequestAccess(request, config);
  if (!canManageAdmin(access) || !access) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Admin session required" }, { status: 401 })
    };
  }
  return { ok: true as const, access };
}
