/** Joins conditional class names without pulling in a dependency. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** 1234 -> "1,234" for social counters. */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/** "13:30" (from <input type="time">) -> "1:30 PM". */
export function formatClock(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function minutesOfDay(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function humanizeMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} hr`;
}

/** "Ends in 34 min" / "Starts in 2 hr" / "Ended", relative to `now`. */
export function timeStatusFor(start: string, end: string, now: Date = new Date()): string {
  const current = now.getHours() * 60 + now.getMinutes();
  const from = minutesOfDay(start);
  const to = minutesOfDay(end);
  if (current < from) return `Starts in ${humanizeMinutes(from - current)}`;
  if (current < to) return `Ends in ${humanizeMinutes(to - current)}`;
  return "Ended";
}

/** "Today, Sep 26" */
export function todayLabel(now: Date = new Date()): string {
  return `Today, ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** True if end is strictly after start (both "HH:MM"). */
export function isTimeRangeValid(start: string, end: string): boolean {
  return Boolean(start && end) && minutesOfDay(end) > minutesOfDay(start);
}
