import { describe, expect, it, vi } from "vitest";
import { detectOkrLanguage, localizedValue, updateLocalizedText } from "./bilingual";

describe("bilingual OKR content", () => {
  it("detects Chinese, English, mixed content, and neutral acronyms", () => {
    expect(detectOkrLanguage("提升 EOL release 质量")).toBe("zh");
    expect(detectOkrLanguage("Improve EOL release quality")).toBe("en");
    expect(detectOkrLanguage("EOL P0/P1")).toBe("neutral");
  });

  it("translates according to the entered language instead of the page language", async () => {
    const translate = vi.fn(async (_text: string, target: "zh" | "en") => target === "zh" ? "提升质量" : "Improve quality");
    const fromEnglish = await updateLocalizedText("Improve quality", undefined, translate);
    const fromChinese = await updateLocalizedText("提升质量", undefined, translate);

    expect(fromEnglish).toMatchObject({ en: "Improve quality", zh: "提升质量", enOrigin: "manual", zhOrigin: "machine" });
    expect(fromChinese).toMatchObject({ zh: "提升质量", en: "Improve quality", zhOrigin: "manual", enOrigin: "machine" });
  });

  it("never overwrites a manually edited translation", async () => {
    const translate = vi.fn(async () => "New machine translation");
    const updated = await updateLocalizedText("更新后的中文", {
      zh: "旧中文",
      en: "Reviewed English",
      zhOrigin: "manual",
      enOrigin: "manual"
    }, translate);

    expect(updated?.en).toBe("Reviewed English");
    expect(updated?.enOrigin).toBe("manual");
    expect(translate).not.toHaveBeenCalled();
  });

  it("retries when the source is unchanged but the target translation is missing", async () => {
    const translate = vi.fn(async () => "提升质量");
    const updated = await updateLocalizedText("Improve quality", {
      en: "Improve quality",
      enOrigin: "manual",
      detectedLanguage: "en"
    }, translate);

    expect(translate).toHaveBeenCalledWith("Improve quality", "zh");
    expect(updated).toMatchObject({ en: "Improve quality", zh: "提升质量", zhOrigin: "machine" });
  });

  it("keeps neutral identifiers identical in both languages", async () => {
    const translated = await updateLocalizedText("EOL P0/P1", undefined, vi.fn());
    expect(localizedValue("", translated, "zh")).toBe("EOL P0/P1");
    expect(localizedValue("", translated, "en")).toBe("EOL P0/P1");
  });
});
