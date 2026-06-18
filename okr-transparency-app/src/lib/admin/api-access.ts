import { NextResponse, type NextRequest } from "next/server";
import { readAdminConfig, type AdminConfig } from "./config";
import { resolveRequestAccess, type UserAccess } from "./permissions";

type ApiAccess =
  | { ok: true; config: AdminConfig; access: UserAccess }
  | { ok: false; response: NextResponse };

export async function requireApiAccess(request: NextRequest): Promise<ApiAccess> {
  const config = await readAdminConfig();
  const access = await resolveRequestAccess(request, config);

  if (!access) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Login required" }, { status: 401 })
    };
  }

  return { ok: true, config, access };
}
