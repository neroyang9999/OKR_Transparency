import { describe, expect, it } from "vitest";
import {
  filterAlignmentOptionGroups,
  flattenAlignmentOptionGroups,
  type AlignmentOption
} from "./alignment-options";

const options: AlignmentOption[] = [
  option("SW-O1", "O", "Improve release quality"),
  option("SW-O2", "O", "Build the next platform"),
  option("SW-O1-KR1", "KR", "Close critical stability issues", "SW-O1", "Improve release quality"),
  option("SW-O1-KR2", "KR", "Raise automated coverage", "SW-O1", "Improve release quality"),
  option("SW-O2-KR1", "KR", "Complete platform rollout", "SW-O2", "Build the next platform")
];

describe("alignment option groups", () => {
  it("keeps each Objective together with its Key Results", () => {
    const groups = filterAlignmentOptionGroups(options);

    expect(groups.map((group) => ({
      objective: group.objective?.id,
      keyResults: group.keyResults.map((item) => item.id)
    }))).toEqual([
      { objective: "SW-O1", keyResults: ["SW-O1-KR1", "SW-O1-KR2"] },
      { objective: "SW-O2", keyResults: ["SW-O2-KR1"] }
    ]);
  });

  it("retains parent context when a search only matches a Key Result", () => {
    const groups = filterAlignmentOptionGroups(options, "stability");

    expect(groups).toHaveLength(1);
    expect(groups[0].objective?.id).toBe("SW-O1");
    expect(groups[0].keyResults.map((item) => item.id)).toEqual(["SW-O1-KR1"]);
    expect(flattenAlignmentOptionGroups(groups).map((item) => item.id)).toEqual(["SW-O1", "SW-O1-KR1"]);
  });
});

function option(id: string, kind: "O" | "KR", title: string, parentId?: string, parentTitle?: string): AlignmentOption {
  return {
    id,
    kind,
    team: "Software",
    owner: "Max Zheng",
    title,
    parentId,
    parentTitle,
    progress: 35,
    confidence: "Yellow"
  };
}
