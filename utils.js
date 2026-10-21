import GLib from "gi://GLib";

export const DEFAULT_TASK = "Focus";
export const POMODORO_SECONDS = 25 * 60;

export function completedPomodoros(durationSeconds) {
  if (!Number.isFinite(durationSeconds)) return 0;

  return Math.max(0, Math.floor(Math.max(0, durationSeconds) / POMODORO_SECONDS));
}

export function formatPomodoros(count) {
  const total = Math.max(0, Math.round(count));

  return `${total} pomodoro${total === 1 ? "" : "s"}`;
}

export function normaliseTasks(tasks) {
  const seen = new Set();
  const out = [];

  for (const task of tasks) {
    if (typeof task !== "string") continue;

    const name = task.trim();
    if (!name || seen.has(name)) continue;

    seen.add(name);
    out.push(name);
  }

  if (!seen.has(DEFAULT_TASK)) out.unshift(DEFAULT_TASK);

  return out;
}

export function formatClock(us) {
  const total = Math.floor(us / 1000000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n) => `${n}`.padStart(2, "0");

  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatHM(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);

  return `${h}h ${m}m`;
}

export function localDay(iso) {
  if (typeof iso !== "string") return null;

  const dt = GLib.DateTime.new_from_iso8601(iso, null);

  return dt ? dt.to_local().format("%Y-%m-%d") : null;
}

export function summarise(sessions) {
  const now = GLib.DateTime.new_now_local();
  const today = now.format("%Y-%m-%d");

  const weekStart = now
    .add_days(-(now.get_day_of_week() - 1))
    .format("%Y-%m-%d");

  const byTask = new Map();

  let total = 0;
  let totalPomodoros = 0;
  let todayTotal = 0;
  let todayPomodoros = 0;
  let weekTotal = 0;
  let weekPomodoros = 0;
  let counted = 0;

  for (const session of sessions) {
    if (!session || typeof session !== "object") continue;

    const raw = session.duration_seconds;
    const duration = Number.isFinite(raw) ? raw : 0;
    const pomodoros = Number.isFinite(session.pomodoros)
      ? Math.max(0, Number(session.pomodoros))
      : completedPomodoros(duration);

    const task =
      typeof session.task === "string" && session.task
        ? session.task
        : DEFAULT_TASK;

    const entry = byTask.get(task) ?? { seconds: 0, count: 0, pomodoros: 0 };
    entry.seconds += duration;
    entry.count += 1;
    entry.pomodoros += pomodoros;
    byTask.set(task, entry);

    total += duration;
    totalPomodoros += pomodoros;
    counted += 1;

    const day = localDay(session.start);
    if (day === today) {
      todayTotal += duration;
      todayPomodoros += pomodoros;
    }
    if (day && day >= weekStart) {
      weekTotal += duration;
      weekPomodoros += pomodoros;
    }
  }

  const perTask = [...byTask]
    .map(([task, data]) => [task, { ...data }])
    .sort((a, b) => b[1].seconds - a[1].seconds);

  return {
    perTask,
    total,
    totalPomodoros,
    todayTotal,
    todayPomodoros,
    weekTotal,
    weekPomodoros,
    weekDays: now.get_day_of_week(),
    counted,
  };
}
