import { describe, expect, it } from "vitest";
import type { AdminPeriodStatus } from "./admin/config";
import { allowedPeriodMoves, deriveDefaultPeriodId, movePeriod, periodsForViewer, resolveViewerPeriod, sortNewestFirst } from "./period-stages";

function periods(...entries: Array<[string, AdminPeriodStatus]>) {
  return entries.map(([id, status]) => ({ id, label: id, labelEn: id, shortLabel: id.toUpperCase(), status }));
}

describe("the default period", () => {
  it("is the one in progress, even while another is open", () => {
    expect(deriveDefaultPeriodId(periods(["2026-q4", "setting"], ["2026-q3", "active"]))).toBe("2026-q3");
    expect(deriveDefaultPeriodId(periods(["2026-q4", "active"], ["2026-q3", "closing"]))).toBe("2026-q4");
  });

  it("falls back to the newest open period, then the newest one anyone can see", () => {
    expect(deriveDefaultPeriodId(periods(["2026-q3", "closing"], ["2026-q4", "setting"]))).toBe("2026-q4");
    expect(deriveDefaultPeriodId(periods(["2027-q1", "planned"], ["2026-q3", "locked"], ["2026-q4", "locked"]))).toBe("2026-q4");
  });
});

describe("moving a period between stages", () => {
  it("sends the period in progress into closing when another starts, rather than locking it", () => {
    const moved = movePeriod(periods(["2026-q4", "setting"], ["2026-q3", "active"], ["2026-q2", "locked"]), "2026-q4", "active");
    expect(moved.map((period) => period.status)).toEqual(["active", "closing", "locked"]);
  });

  it("leaves other periods alone for any other move", () => {
    const moved = movePeriod(periods(["2026-q4", "planned"], ["2026-q3", "active"]), "2026-q4", "setting");
    expect(moved.map((period) => period.status)).toEqual(["setting", "active"]);
  });

  it("lets a closing period resume only while nothing else is in progress", () => {
    const busy = periods(["2026-q4", "active"], ["2026-q3", "closing"]);
    expect(allowedPeriodMoves(busy[1], busy)).toEqual([{ to: "locked" }, { to: "active", blockedBy: "2026-Q4" }]);

    const idle = periods(["2026-q4", "setting"], ["2026-q3", "closing"]);
    expect(allowedPeriodMoves(idle[1], idle)).toEqual([{ to: "locked" }, { to: "active", blockedBy: undefined }]);
  });
});

describe("periods a viewer can see", () => {
  const config = { defaultPeriodId: "2026-q3", periods: periods(["2026-q4", "planned"], ["2026-q3", "active"], ["2026-q2", "locked"]) };

  it("hides planned periods from everyone but administrators", () => {
    expect(periodsForViewer(config, "user").map((period) => period.id)).toEqual(["2026-q3", "2026-q2"]);
    expect(periodsForViewer(config, "super_admin").map((period) => period.id)).toEqual(["2026-q4", "2026-q3", "2026-q2"]);
  });

  it("sends a request for a hidden period to the default one", () => {
    expect(resolveViewerPeriod("2026-q4", config, "team_leader")).toBe("2026-q3");
    expect(resolveViewerPeriod("2026-q4", config, "super_admin")).toBe("2026-q4");
    expect(resolveViewerPeriod("nope", config, "super_admin")).toBe("2026-q3");
  });
});

describe("ordering periods", () => {
  it("sorts quarters by date and keeps the configured order otherwise", () => {
    expect(sortNewestFirst([{ id: "2026-q2" }, { id: "2027-q1" }, { id: "2026-q4" }]).map((period) => period.id))
      .toEqual(["2027-q1", "2026-q4", "2026-q2"]);
  });
});
