export type GradeBand = { min_score: number; max_score: number; grade: string; remark: string };

export const AFFECTIVE_TRAITS = [
  "Punctuality",
  "Honesty",
  "Neatness",
  "Discipline",
  "Social interaction",
] as const;

export const PSYCHOMOTOR_TRAITS = [
  "Handwriting",
  "Creativity",
  "Drawing",
  "Sports & games",
  "Practical skills",
] as const;

export const RATING_LABELS: Record<number, string> = {
  5: "Excellent",
  4: "Very good",
  3: "Good",
  2: "Fair",
  1: "Needs work",
};

export function gradeFor(total: number, bands: GradeBand[]): GradeBand | null {
  return (
    bands.find((band) => total >= Number(band.min_score) && total <= Number(band.max_score)) ?? null
  );
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
