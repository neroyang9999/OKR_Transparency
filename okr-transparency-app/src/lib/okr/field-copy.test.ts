import { describe, expect, it } from "vitest";
import { confidenceChoices, confidenceHelper, typeChoices, typeHelper } from "./field-copy";
import { confidenceLevels, okrTypes } from "./types";

const langs = ["zh", "en"] as const;

describe("field choice copy", () => {
  it("covers every enum value in both languages", () => {
    langs.forEach((lang) => {
      expect(typeChoices(lang).map((choice) => choice.value)).toEqual([...okrTypes]);
      expect(confidenceChoices(lang).map((choice) => choice.value)).toEqual([...confidenceLevels]);
    });
  });

  it("keeps the stored enum word visible in every label", () => {
    langs.forEach((lang) => {
      [...typeChoices(lang), ...confidenceChoices(lang)].forEach((choice) => {
        expect(choice.label.startsWith(choice.value)).toBe(true);
      });
    });
  });

  it("gives every option a helper line", () => {
    langs.forEach((lang) => {
      [...typeChoices(lang), ...confidenceChoices(lang)].forEach((choice) => {
        expect(choice.helper.trim().length).toBeGreaterThan(0);
      });
    });
  });

  it("resolves the helper of the selected value", () => {
    expect(typeHelper("Committed", "zh")).toBe("本周期需要 100% 达成。");
    expect(typeHelper("Aspirational", "en")).toBe("60–70% counts as success.");
    expect(confidenceHelper("Red", "zh")).toBe("靠团队自己已经解决不了，需要上级或跨团队决策。");
  });

  // A native select paints the selected option into a quarter-width cell — measured at 169px of
  // usable width on a 1512px viewport, which is roughly 24 half-width glyphs at 14px. A label that
  // grows past that truncates silently. Counting characters would misjudge it, since a CJK glyph is
  // about twice as wide as a Latin one, so measure display width instead.
  it("keeps every label narrow enough for the quarter-width control", () => {
    const displayWidth = (text: string) => Array.from(text)
      .reduce((total, character) => total + (/[⺀-鿿＀-｠]/.test(character) ? 2 : 1), 0);

    langs.forEach((lang) => {
      [...typeChoices(lang), ...confidenceChoices(lang)].forEach((choice) => {
        expect(displayWidth(choice.label)).toBeLessThanOrEqual(24);
      });
    });
  });
});
