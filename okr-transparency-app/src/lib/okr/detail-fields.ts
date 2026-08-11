import type { OkrRecord } from "./types";

export const okrDetailFieldKeys = [
  "baseline",
  "target",
  "actual",
  "dependencies",
  "risks",
  "decisions_needed"
] as const;

export type OkrDetailFieldKey = (typeof okrDetailFieldKeys)[number];

export function getPopulatedOkrDetailFields(
  record: Partial<Pick<OkrRecord, OkrDetailFieldKey>>
): OkrDetailFieldKey[] {
  return okrDetailFieldKeys.filter((key) => Boolean(record[key]?.trim()));
}
