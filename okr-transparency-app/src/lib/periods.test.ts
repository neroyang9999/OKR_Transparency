import { describe, expect, it } from "vitest";
import { nextQuarterPeriod, okrDetailHref, periodHref } from "./periods";

describe("period links", () => {
  it("keeps the selected member while switching periods in edit mode", () => {
    expect(periodHref("2026-q2", "TPM Team", "zh", "edit", "yang.luo@unitxlabs.com"))
      .toBe("/?team=TPM+Team&period=2026-q2&mode=edit&member=yang.luo%40unitxlabs.com");
  });

  it("carries the period into OKR detail links", () => {
    expect(okrDetailHref("SW O1", "2026-q3", "en")).toBe("/okr/SW%20O1?period=2026-q3&lang=en");
  });
});

describe("next quarter period", () => {
  it("follows the newest configured quarter with the labels the existing periods use", () => {
    expect(nextQuarterPeriod([{ id: "2026-q2" }, { id: "2026-q3" }])).toEqual({
      id: "2026-q4",
      label: "2026 年 10 月 - 12 月",
      labelEn: "Oct - Dec 2026",
      shortLabel: "2026 Q4"
    });
  });

  it("rolls over into the next year", () => {
    expect(nextQuarterPeriod([{ id: "2026-q4" }]).id).toBe("2027-q1");
  });

  it("ignores ids that are not quarters and falls back to the current quarter", () => {
    expect(nextQuarterPeriod([{ id: "period-mg1abc" }], new Date(2026, 9, 10))).toMatchObject({
      id: "2026-q4",
      label: "2026 年 10 月 - 12 月"
    });
  });
});
