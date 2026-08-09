// Ride-log insights (pure). All distances in miles; the renderer converts to the display unit.
// `now` is injectable for deterministic tests.
export function computeInsights(log, now = new Date()) {
  const rides = (log || []).filter(e => e && e.date);
  const totalRides = rides.length;
  const dists = rides.map(e => e.distanceMi || 0);
  const totalMi = dists.reduce((a, b) => a + b, 0);
  const withDist = dists.filter(d => d > 0);
  const avgMi = withDist.length ? totalMi / withDist.length : 0;
  const longestMi = withDist.length ? Math.max(...withDist) : 0;

  // Last 8 Monday-based weeks, oldest -> newest (current week last).
  const mondayOf = d => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  };
  const curMon = mondayOf(now);
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const ws = new Date(curMon);
    ws.setDate(curMon.getDate() - i * 7);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 7);
    const mi = rides.reduce((s, e) => {
      const d = new Date(e.date);
      return d >= ws && d < we ? s + (e.distanceMi || 0) : s;
    }, 0);
    weeks.push({ label: `${ws.getMonth() + 1}/${ws.getDate()}`, mi, isCurrent: i === 0 });
  }

  // Last 6 calendar months, oldest -> newest (current month last).
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1).getTime();
    const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
    const mi = rides.reduce((s, e) => {
      const t = new Date(e.date).getTime();
      return t >= mStart && t < mEnd ? s + (e.distanceMi || 0) : s;
    }, 0);
    months.push({ label: MON[new Date(mStart).getMonth()], mi, isCurrent: i === 0 });
  }
  const thisMonthMi = months[months.length - 1].mi;

  const byFeel = { great: 0, good: 0, tough: 0, bad: 0 };
  for (const e of rides) if (e.feel && byFeel[e.feel] != null) byFeel[e.feel]++;

  return { totalRides, totalMi, avgMi, longestMi, weeks, months, thisMonthMi, byFeel };
}
