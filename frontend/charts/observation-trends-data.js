/** Keep unavailable years as gaps; only explicit processed zero totals become zero points. */
export function buildYearlyTrendSeries(rows, startYear, endYear) {
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear > endYear) throw new Error("Invalid year range");
  const values = new Map();
  for (const row of rows) {
    const year = Number(row.year);
    if (!Number.isInteger(year) || year < startYear || year > endYear || values.has(year)) throw new Error("Invalid or duplicate trend year");
    const unavailable = row.summary_available === false || row.observation_records === null;
    const count = unavailable ? null : Number(row.observation_records);
    if (!unavailable && (row.observation_records === "" || !Number.isSafeInteger(count) || count < 0)) throw new Error("Invalid observation record count");
    values.set(year, { year, observationRecords: count });
  }
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => {
    const year = startYear + index;
    return values.get(year) || { year, observationRecords: null };
  });
}
