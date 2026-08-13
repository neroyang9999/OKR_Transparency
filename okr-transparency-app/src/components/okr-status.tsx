import { Badge } from "@/components/ui/badge";
import type { ConfidenceLevel, OkrType } from "@/lib/okr/types";

/** Status semantics shared by the alignment canvas: card rail, progress fill, and legend dots. */
export const confidenceTone: Record<ConfidenceLevel, { fill: string; rail: string; ring: string }> = {
  Green: { fill: "bg-emerald-400", rail: "border-l-emerald-400", ring: "bg-emerald-400" },
  Yellow: { fill: "bg-amber-400", rail: "border-l-amber-400", ring: "bg-amber-400" },
  Red: { fill: "bg-rose-400", rail: "border-l-rose-400", ring: "bg-rose-400" }
};

export function ConfidenceBadge({ value }: { value: ConfidenceLevel }) {
  const tone = value === "Green" ? "green" : value === "Yellow" ? "yellow" : "red";
  return <Badge tone={tone}>{value}</Badge>;
}

export function TypeBadge({ value }: { value: OkrType }) {
  const tone = value === "Committed" ? "blue" : value === "Aspirational" ? "yellow" : "gray";
  return <Badge tone={tone}>{value}</Badge>;
}

export function Score({ value }: { value: number | null }) {
  return <span className="tabular-nums">{value === null ? "N/A" : value.toFixed(1)}</span>;
}
