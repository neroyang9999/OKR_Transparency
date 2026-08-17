import type { Lang } from "@/lib/i18n";
import { confidenceLevels, okrTypes, type ConfidenceLevel, type OkrType } from "./types";

/**
 * Type and Confidence used to render as bare enum words, which told nobody how to choose.
 * `label` is what the dropdown shows; `helper` is the line that stays under the closed control.
 *
 * A native select paints the selected option's text into the control, and that control is a quarter
 * of the objective row — 169px of usable width at a 1512px viewport. Labels stay at the bare name
 * for that reason; the scoring anchor lives in `helper`, which has the full row to wrap into. Every
 * label keeps its enum word so the stored value stays recognisable, and the confidence wording
 * matches the weekly progress note (正常 / 关注 / 风险).
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
    Committed: { label: "Committed · 必达", helper: "本周期必须 100% 达成。" },
    Aspirational: { label: "Aspirational · 挑战", helper: "做到 60–70% 即算有效。" },
    Learning: { label: "Learning · 探索", helper: "用于不确定性高的探索。KR 要回答“本周期必须学会什么”。" }
  },
  en: {
    Committed: { label: "Committed · Must hit", helper: "Must reach 100% this cycle." },
    Aspirational: { label: "Aspirational · Stretch", helper: "60–70% counts as success." },
    Learning: { label: "Learning · Explore", helper: "For high-uncertainty work. The KR answers what you must learn." }
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
