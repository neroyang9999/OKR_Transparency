import { describe, expect, it } from "vitest";
import { validateFeedbackInput } from "./feedback";

describe("feedback input", () => {
  it("trims feedback and keeps page context", () => {
    expect(validateFeedbackInput({ message: "  Useful suggestion  ", page: "/teams?lang=en" })).toEqual({
      ok: true,
      value: { message: "Useful suggestion", page: "/teams?lang=en" }
    });
  });

  it("rejects empty or oversized feedback", () => {
    expect(validateFeedbackInput({ message: "   " })).toMatchObject({ ok: false });
    expect(validateFeedbackInput({ message: "x".repeat(2001) })).toMatchObject({ ok: false });
  });
});
