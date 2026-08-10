import { google } from "googleapis";
import { updateLocalizedText } from "./bilingual";
import type { OkrDraft } from "./edit-types";

type TargetLanguage = "zh" | "en";
type PendingTranslation = {
  text: string;
  resolve: (value: string) => void;
};

export async function translateDraftContent(draft: OkrDraft): Promise<OkrDraft> {
  const translate = createGoogleCloudTranslator();
  return {
    ...draft,
    objectives: await Promise.all(draft.objectives.map(async (objective) => ({
      ...objective,
      titleLocalized: await updateLocalizedText(objective.title, objective.titleLocalized, translate),
      keyResults: await Promise.all(objective.keyResults.map(async (kr) => ({
        ...kr,
        titleLocalized: await updateLocalizedText(kr.title, kr.titleLocalized, translate),
        risksLocalized: await updateLocalizedText(kr.risks, kr.risksLocalized, translate),
        decisionsNeededLocalized: await updateLocalizedText(kr.decisionsNeeded, kr.decisionsNeededLocalized, translate)
      })))
    })))
  };
}

function createGoogleCloudTranslator() {
  const queues: Record<TargetLanguage, PendingTranslation[]> = { zh: [], en: [] };
  let scheduled = false;

  return (text: string, targetLanguage: TargetLanguage) => new Promise<string>((resolve) => {
    queues[targetLanguage].push({ text, resolve });
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(async () => {
      scheduled = false;
      await Promise.all((["zh", "en"] as const).map(async (target) => {
        const pending = queues[target].splice(0);
        if (pending.length === 0) return;
        const translated = await translateBatch(pending.map((item) => item.text), target).catch(() => []);
        pending.forEach((item, index) => item.resolve(translated[index] ?? ""));
      }));
    });
  });
}

async function translateBatch(contents: string[], targetLanguage: TargetLanguage) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.FIRESTORE_PROJECT_ID;
  if (!projectId) return [];

  const auth = await google.auth.getClient({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"]
  });
  const client = google.translate({ version: "v3", auth });
  const response = await client.projects.locations.translateText({
    parent: `projects/${projectId}/locations/global`,
    requestBody: {
      contents,
      mimeType: "text/plain",
      targetLanguageCode: targetLanguage
    }
  });
  return response.data.translations?.map((translation) => translation.translatedText?.trim() ?? "") ?? [];
}
