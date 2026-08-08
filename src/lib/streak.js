// Weekly ride streak (Monday-based). Pure — `now` injectable for tests.
export function calcStreak(log, now = new Date()) {
  if (!log.length) return 0;
  let streak = 0;
  let checkWeek = new Date(now);
  let firstWeek = true; // the current week may still be empty early on — don't break the streak for it

  while (true) {
    const weekStart = new Date(checkWeek);
    weekStart.setDate(checkWeek.getDate() - ((checkWeek.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const hasRide = log.some(e => {
      const d = new Date(e.date);
      return d >= weekStart && d < weekEnd;
    });

    if (hasRide) {
      streak++;
      checkWeek.setDate(checkWeek.getDate() - 7);
      firstWeek = false;
    } else if (firstWeek) {
      // No ride yet this (partial) week — skip it without ending the streak.
      checkWeek.setDate(checkWeek.getDate() - 7);
      firstWeek = false;
    } else {
      break;
    }
  }
  return streak;
}
