import { describe, expect, it } from "vitest";
import { periodHref } from "./periods";

describe("period links", () => {
  it("keeps the selected member while switching periods in edit mode", () => {
    expect(periodHref("2026-q2", "TPM Team", "zh", "edit", "yang.luo@unitxlabs.com"))
      .toBe("/?team=TPM+Team&period=2026-q2&mode=edit&member=yang.luo%40unitxlabs.com");
  });
});
