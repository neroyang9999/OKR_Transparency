import type { Lang } from "@/lib/i18n";
import { confidenceLevels, okrTypes, type ConfidenceLevel, type OkrType } from "./types";

/**
 * Type and Confidence used to render as bare enum words, which told nobody how to choose.
 * `label` is what the dropdown shows; `helper` is the line that stays under the closed control.
 *
 * Type keeps the bare enum: Committed / Aspirational / Learning already read as words, so the
 * helper alone carries the meaning. Confidence cannot — Green / Yellow / Red are colours — so its
 * labels take the wording the weekly progress note already uses (正常 / 关注 / 风险).
 *
 * Every label starts with its enum word, because the stored value and the public badge still show
 * that word. Labels also stay short: a native select paints the selected option into the control,
 * which is a quarter of the objective row, so a label that grows into a sentence truncates.
 *
 * Wording follows unitx-okr-diagnostic-report.md:235-238; helpers say what an option means, never
 * what to do after missing it.
 */
export type FieldChoice = {
  value: string;
  label: string;
  helper: string;
};

const typeCopy: Record<Lang, Record<OkrType, Omit<FieldChoice, "value">>> = {
  zh: {
    Committed: { label: "Committed", helper: "本周期必须 100% 达成。" },
    Aspirational: { label: "Aspirational", helper: "做到 60–70% 即算有效。" },
    Learning: { label: "Learning", helper: "用于不确定性高的探索。KR 要回答“本周期必须学会什么”。" }
  },
  en: {
    Committed: { label: "Committed", helper: "Must reach 100% this cycle." },
    Aspirational: { label: "Aspirational", helper: "60–70% counts as success." },
    Learning: { label: "Learning", helper: "For high-uncertainty work. The KR answers what you must learn." }
  }
};

const confidenceCopy: Record<Lang, Record<ConfidenceLevel, Omit<FieldChoice, "value">>> = {
  zh: {
    Green: { label: "Green · 正常", helper: "按计划推进，周期末大概率达成。" },
    Yellow: { label: "Yellow · 关注", helper: "有风险但还能自己解决。需要在周进展里写明风险。" },
    Red: { label: "Red · 风险", helper: "靠团队自己已经解决不了，需要上级或跨团队决策。" }
  },
  en: {
    Green: { label: "Green · On track", helper: "On pace to land by the end of the cycle." },
    Yellow: { label: "Yellow · At risk", helper: "Recoverable inside the team. A weekly update must state the risk." },
    Red: { label: "Red · Blocked", helper: "Cannot be solved inside the team; needs a decision from outside." }
  }
};

export function typeChoices(lang: Lang): FieldChoice[] {
  return okrTypes.map((value) => ({ value, ...typeCopy[lang][value] }));
}

export function confidenceChoices(lang: Lang): FieldChoice[] {
  return confidenceLevels.map((value) => ({ value, ...confidenceCopy[lang][value] }));
}

export function typeHelper(value: OkrType, lang: Lang) {
  return typeCopy[lang][value].helper;
}

export function confidenceHelper(value: ConfidenceLevel, lang: Lang) {
  return confidenceCopy[lang][value].helper;
}
