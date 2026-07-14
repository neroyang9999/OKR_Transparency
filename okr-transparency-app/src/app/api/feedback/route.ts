import { NextResponse, type NextRequest } from "next/server";
import { requireApiAccess } from "@/lib/admin/api-access";
import { appendUserFeedback, validateFeedbackInput } from "@/lib/feedback";

export async function POST(request: NextRequest) {
  const authorization = await requireApiAccess(request);
  if (!authorization.ok) return authorization.response;

  const body = await request.json().catch(() => ({})) as { message?: unknown; page?: unknown };
  const validation = validateFeedbackInput(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const feedback = await appendUserFeedback(validation.value, {
      email: authorization.access.email,
      displayName: authorization.access.displayName
    });
    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown feedback save error" },
      { status: 422 }
    );
  }
}
