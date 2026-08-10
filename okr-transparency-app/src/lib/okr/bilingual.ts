import type { ContentLanguage, LocalizedText } from "./types";

type Translate = (text: string, targetLanguage: "zh" | "en") => Promise<string>;

export function detectOkrLanguage(value: string): ContentLanguage {
  const text = value.trim();
  if (!text) return "neutral";
  if (/\p{Script=Han}/u.test(text)) return "zh";
  const latinTokens = text.match(/[A-Za-z]+/g) ?? [];
  if (latinTokens.length > 0 && latinTokens.every((token) => token === token.toUpperCase())) return "neutral";
  if (/[a-z]/.test(text) || /[A-Za-z]+\s+[A-Za-z]+/.test(text)) return "en";
  return "neutral";
}

export async function updateLocalizedText(
  value: string,
  existing: LocalizedText | undefined,
  translate: Translate
): Promise<LocalizedText | undefined> {
  const text = value.trim();
  if (!text) return undefined;
  if (text === existing?.zh || text === existing?.en) return existing;

  const detectedLanguage = detectOkrLanguage(text);
  if (detectedLanguage === "neutral") {
    return {
      zh: text,
      en: text,
      zhOrigin: "manual",
      enOrigin: "manual",
      detectedLanguage
    };
  }

  const targetLanguage = detectedLanguage === "zh" ? "en" : "zh";
  const sourceOriginKey = detectedLanguage === "zh" ? "zhOrigin" : "enOrigin";
  const targetOriginKey = targetLanguage === "zh" ? "zhOrigin" : "enOrigin";
  const targetWasManuallyEdited = existing?.[targetOriginKey] === "manual";
  let translated = targetWasManuallyEdited ? existing?.[targetLanguage] ?? "" : "";
  let machineTranslated = false;

  if (!targetWasManuallyEdited) {
    translated = await translate(text, targetLanguage).catch(() => "");
    machineTranslated = Boolean(translated);
  }

  return {
    ...existing,
    [detectedLanguage]: text,
    [sourceOriginKey]: "manual",
    ...(translated ? { [targetLanguage]: translated } : {}),
    ...(machineTranslated ? { [targetOriginKey]: "machine" } : {}),
    detectedLanguage
  };
}

export function localizedValue(value: string, localized: LocalizedText | undefined, language: "zh" | "en") {
  return localized?.[language]?.trim() || value;
}
