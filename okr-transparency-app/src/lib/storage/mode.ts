export type OkrStorageMode = "file" | "firestore";

export function getStorageMode(env: NodeJS.ProcessEnv = process.env): OkrStorageMode {
  const explicitMode = env.OKR_STORAGE?.trim().toLowerCase();
  if (explicitMode === "file" || explicitMode === "firestore") return explicitMode;
  if (explicitMode) throw new Error("OKR_STORAGE must be either 'file' or 'firestore'");

  return env.K_SERVICE ? "firestore" : "file";
}

export function isFirestoreStorageEnabled() {
  return getStorageMode() === "firestore";
}
