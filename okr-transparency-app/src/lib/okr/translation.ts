import { google } from "googleapis";
import { updateLocalizedText } from "./bilingual";
import type { OkrDraft } from "./edit-types";

const translationTimeoutMs = 8_000;

type TargetLanguage = "zh" | "en";
type PendingTranslation = {
  text: string;
  resolve: (value: string) => void;
};

type Translator = {
  translate: (text: string, targetLanguage: TargetLanguage) => Promise<string>;
  warnings: string[];
};

export async function translateDraftContent(draft: OkrDraft): Promise<{ draft: OkrDraft; warnings: string[] }> {
  const translator = createGoogleCloudTranslator();
  const translatedDraft = {
    ...draft,
    objectives: await Promise.all(draft.objectives.map(async (objective) => ({
      ...objective,
      titleLocalized: await updateLocalizedText(objective.title, objective.titleLocalized, translator.translate),
      keyResults: await Promise.all(objective.keyResults.map(async (kr) => ({
        ...kr,
        titleLocalized: await updateLocalizedText(kr.title, kr.titleLocalized, translator.translate),
        risksLocalized: await updateLocalizedText(kr.risks, kr.risksLocalized, translator.translate),
        decisionsNeededLocalized: await updateLocalizedText(kr.decisionsNeeded, kr.decisionsNeededLocalized, translator.translate)
      })))
    })))
  };
  return { draft: translatedDraft, warnings: translator.warnings };
}

function createGoogleCloudTranslator(): Translator {
  const queues: Record<TargetLanguage, PendingTranslation[]> = { zh: [], en: [] };
  const warnings: string[] = [];
  let scheduled = false;

  const translate = (text: string, targetLanguage: TargetLanguage) => new Promise<string>((resolve) => {
    queues[targetLanguage].push({ text, resolve });
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(async () => {
      scheduled = false;
      await Promise.all((["zh", "en"] as const).map(async (target) => {
        const pending = queues[target].splice(0);
        if (pending.length === 0) return;
        const translated = await translateBatch(pending.map((item) => item.text), target).catch((error) => {
          const message = `Machine translation to ${target} failed; original text was saved.`;
          warnings.push(message);
          console.error("Cloud Translation batch failed", {
            targetLanguage: target,
            itemCount: pending.length,
            error: error instanceof Error ? error.message : "Unknown error"
          });
          return [];
        });
        pending.forEach((item, index) => item.resolve(translated[index] ?? ""));
      }));
    });
  });

  return { translate, warnings };
}

async function translateBatch(contents: string[], targetLanguage: TargetLanguage) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.FIRESTORE_PROJECT_ID;
  if (!projectId) return [];

  // Autosave awaits this call, so an unreachable translation endpoint would
  // otherwise hold the editor's save open indefinitely. On timeout the caller
  // records a warning and keeps the author's original text.
  return withDeadline((async () => {
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
    }, { timeout: translationTimeoutMs });
    return response.data.translations?.map((translation) => translation.translatedText?.trim() ?? "") ?? [];
  })(), `Cloud Translation to ${targetLanguage}`);
}

function withDeadline<T>(work: Promise<T>, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${translationTimeoutMs}ms`)), translationTimeoutMs);
  });

  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
