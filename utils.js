import GLib from "gi://GLib";

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
  let todayTotal = 0;
  let weekTotal = 0;
  let counted = 0;

  for (const session of sessions) {
    if (!session || typeof session !== "object") continue;

    const duration = Number.isFinite(session.duration) ? session.duration : 0;
    const task =
      typeof session.task === "string" && session.task ? session.task : "none";

    const entry = byTask.get(task) ?? { seconds: 0, count: 0 };
    entry.seconds += duration;
    entry.count += 1;
    byTask.set(task, entry);

    total += duration;
    counted += 1;

    const day = localDay(session.startTime);
    if (day === today) todayTotal += duration;
    if (day && day >= weekStart) weekTotal += duration;
  }

  const perTask = [...byTask].sort((a, b) => b[1].seconds - a[1].seconds);

  return {
    perTask,
    total,
    todayTotal,
    weekTotal,
    weekDays: now.get_day_of_week(), // 1 on Monday … 7 on Sunday
    counted,
  };
}
