/** Keep unavailable years as gaps; calculate averages from the unrounded counts and days. */
export function buildHolidaySeries(rows, startYear, endYear) {
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear>endYear) throw new Error("Invalid holiday year range");
  const years = new Map();
  for (const row of rows) {
    const year = Number(row.year);
    if (!Number.isInteger(year) || year < startYear || year > endYear || years.has(year)) throw new Error("Invalid or duplicate holiday year");
    const point = { year, holidayAverage: null, nonHolidayAverage: null, reason: row.unavailable_reason || "Summary unavailable" };
    if (row.summary_available === true) {
      const fields = { holidayDays: row.holiday_days, nonHolidayDays: row.non_holiday_days,
        holidayObservations: row.holiday_observations, nonHolidayObservations: row.non_holiday_observations };
      for (const [key,value] of Object.entries(fields)) {
        if (value === null || value === "" || !Number.isSafeInteger(Number(value)) || Number(value)<0) throw new Error("Invalid holiday observations");
        point[key] = Number(value);
      }
      const calendarDays = new Date(Date.UTC(year+1,0,1))-new Date(Date.UTC(year,0,1));
      if (!point.holidayDays || !point.nonHolidayDays || point.holidayDays+point.nonHolidayDays!==calendarDays/86400000) throw new Error("Invalid calendar denominators");
      point.holidayAverage = point.holidayObservations/point.holidayDays;
      point.nonHolidayAverage = point.nonHolidayObservations/point.nonHolidayDays;
      point.reason = null;
    }
    years.set(year, point);
  }
  return Array.from({length:endYear-startYear+1},(_,index)=>{
    const year=startYear+index;
    return years.get(year) || {year,holidayAverage:null,nonHolidayAverage:null,reason:"Summary unavailable"};
  });
}
