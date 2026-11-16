import odaiJson from "../../content/odai.json";
import siteJson from "../../content/site.json";
import type { GradeKey, Odai } from "./game/types";

export const site = siteJson;

export type SoundName = keyof typeof siteJson.sounds;

/** enabled が true のお題だけ。形式は scripts/validate-content.mjs が起動・ビルド前に検証する。 */
export const odaiList: Odai[] = (odaiJson as unknown as Odai[]).filter((o) => o.enabled);

export const odaiIds: string[] = odaiList.map((o) => o.id);

export function findOdai(id: string | null): Odai | undefined {
  return id ? odaiList.find((o) => o.id === id) : undefined;
}

export function gradeLabel(grade: GradeKey): string {
  return site.grades[grade];
}

/** "2026-12-31" → "2026年12月31日" */
export function formatDateJa(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日` : iso;
}
