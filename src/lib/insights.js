// Ride-log insights (pure). All distances in miles; the renderer converts to the display unit.
// `now` is injectable for deterministic tests.
//
// `opts.year` / `opts.month` scope the headline stats (tiles + feel) to the same
// slice the Log list is showing. Defaults ('all') reproduce the all-time view.
// `month` is 0-indexed (0 = Jan) and only applies when a specific `year` is set.
export function computeInsights(log, now = new Date(), opts = {}) {
  const { year = 'all', month = 'all' } = opts;
  const scoped = year !== 'all';

  const all = (log || []).filter(e => e && e.date);
  // Rides driving the tiles + feel: honor the active year/month filter.
  const rides = all.filter(e => {
    if (!scoped) return true;
    const d = new Date(e.date);
    if (d.getFullYear() !== year) return false;
    if (month !== 'all' && d.getMonth() !== month) return false;
    return true;
  });

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

  // Calendar months from the first logged month through the current month, capped
  // at the last 6 (oldest -> newest, current month last). We don't render months
  // before the user's first ride — empty leading bars just look broken. Interior
  // zero months (rode in June and August but not July) are kept, honestly showing the gap.
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const months = [];
  if (scoped) {
    // Year-in-review: all 12 calendar months of the selected year (Jan..Dec).
    // Bars come from the whole year regardless of a month filter so the chart
    // shows the year's shape; the selected month (or today's, in the current
    // year) is flagged as current for emphasis.
    const yearRides = all.filter(e => new Date(e.date).getFullYear() === year);
    const isThisYear = year === now.getFullYear();
    for (let m = 0; m < 12; m++) {
      const mStart = new Date(year, m, 1).getTime();
      const mEnd = new Date(year, m + 1, 1).getTime();
      const mi = yearRides.reduce((s, e) => {
        const t = new Date(e.date).getTime();
        return t >= mStart && t < mEnd ? s + (e.distanceMi || 0) : s;
      }, 0);
      const isCurrent = month !== 'all' ? m === month : (isThisYear && m === now.getMonth());
      months.push({ label: MON[m], mi, isCurrent });
    }
  } else {
    // Rolling last 6 calendar months, capped at the first logged month so there
    // are no empty leading bars. Interior zero months are kept (honest gaps).
    const firstRideTime = rides.length
      ? Math.min(...rides.map(e => new Date(e.date).getTime()))
      : now.getTime();
    const fr = new Date(firstRideTime);
    const firstMonthStart = new Date(fr.getFullYear(), fr.getMonth(), 1).getTime();
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1).getTime();
      if (mStart < firstMonthStart) continue; // skip months before the first ride
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
      const mi = rides.reduce((s, e) => {
        const t = new Date(e.date).getTime();
        return t >= mStart && t < mEnd ? s + (e.distanceMi || 0) : s;
      }, 0);
      months.push({ label: MON[new Date(mStart).getMonth()], mi, isCurrent: i === 0 });
    }
  }
  const thisMonthMi = months.length ? months[months.length - 1].mi : 0;

  const byFeel = { great: 0, good: 0, tough: 0, bad: 0 };
  for (const e of rides) if (e.feel && byFeel[e.feel] != null) byFeel[e.feel]++;

  return { totalRides, totalMi, avgMi, longestMi, weeks, months, thisMonthMi, byFeel, scoped };
}
