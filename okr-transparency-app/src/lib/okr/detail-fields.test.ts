import { describe, expect, it } from "vitest";
import { getPopulatedOkrDetailFields } from "./detail-fields";

describe("OKR detail fields", () => {
  it("omits optional fields when none contain a value", () => {
    expect(getPopulatedOkrDetailFields({
      baseline: "",
      target: "  ",
      actual: "",
      dependencies: "",
      risks: "\n",
      decisions_needed: ""
    })).toEqual([]);
  });

  it("tolerates historical records that omit optional fields", () => {
    expect(getPopulatedOkrDetailFields({ actual: "In progress" })).toEqual(["actual"]);
  });

  it("returns only populated fields in display order", () => {
    expect(getPopulatedOkrDetailFields({
      baseline: "Current state",
      target: "",
      actual: "3 customers",
      dependencies: "",
      risks: "Blocked by hardware",
      decisions_needed: ""
    })).toEqual(["baseline", "actual", "risks"]);
  });
});
