import { Badge } from "@/components/ui/badge";
import type { ConfidenceLevel, OkrType } from "@/lib/okr/types";

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
