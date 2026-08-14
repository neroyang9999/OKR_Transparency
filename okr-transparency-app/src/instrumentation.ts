export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ describeRuntimeConfiguration }, { writeAppLog }] = await Promise.all([
    import("./lib/runtime-config"),
    import("./lib/app-log")
  ]);
  const summary = describeRuntimeConfiguration();

  await writeAppLog({
    level: summary.warnings.length > 0 ? "warn" : "info",
    scope: "startup",
    event: "runtime.configuration",
    message: `Auth ${summary.authMode} · storage ${summary.storageMode} · logs ${summary.logDestination}`,
    details: {
      authMode: summary.authMode,
      storageMode: summary.storageMode,
      allowedGoogleDomains: summary.allowedGoogleDomains,
      adminTokenLoginEnabled: summary.adminTokenLoginEnabled,
      localCredentialsEnabled: summary.localCredentialsEnabled,
      warnings: summary.warnings
    }
  });
}
