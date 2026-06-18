import { readAdminConfig } from "./config";
import { getAccessForSessionUser, getCurrentSessionUser } from "./permissions";

export async function getPageAccess() {
  const [adminConfig, sessionUser] = await Promise.all([
    readAdminConfig(),
    getCurrentSessionUser()
  ]);

  return {
    adminConfig,
    sessionUser,
    access: getAccessForSessionUser(adminConfig, sessionUser)
  };
}
