import { validateSeasonalTrend } from "./species-trend-query.js";

export function validateHolidayObservations(countyCode, startYear, endYear) {
  validateSeasonalTrend(countyCode, "county", startYear, endYear);
}

export const HOLIDAY_OBSERVATIONS_SQL = `
  WITH selected_taxon AS (
    SELECT taxon_id FROM reference_db.taxa WHERE taxon_id = $2 AND category = 'species'
  ), selected_county AS (
    SELECT county_code FROM reference_db.counties WHERE county_code = $1
  ), years AS (
    SELECT year::INTEGER AS year,
      date_diff('day', make_date(year::INTEGER,1,1), make_date(year::INTEGER+1,1,1))::INTEGER AS calendar_days
    FROM range($3::INTEGER, $4::INTEGER+1) y(year)
  ), actual_dates AS (
    SELECT DISTINCT date FROM daily_db.holidays
    WHERE is_observed = FALSE AND year(date) BETWEEN $3 AND $4
  ), calendar AS (
    SELECT y.year, y.calendar_days, COUNT(h.date)::INTEGER AS holiday_days
    FROM years y LEFT JOIN actual_dates h ON year(h.date)=y.year
    GROUP BY y.year,y.calendar_days
  ), annual_reference AS (
    SELECT year,SUM(observation_rows) AS records,
      COUNT(*) FILTER(WHERE observation_rows IS NULL) AS missing
    FROM reference_db.species_region_year
    WHERE region_level='county' AND region_code=$1 AND taxon_id=$2 AND year BETWEEN $3 AND $4
    GROUP BY year
  ), annual_daily AS (
    SELECT year,SUM(observation_rows) AS records,
      COUNT(*) FILTER(WHERE observation_rows IS NULL) AS missing
    FROM daily_db.species_region_year_avg
    WHERE region_level='county' AND region_code=$1 AND taxon_id=$2 AND year BETWEEN $3 AND $4
    GROUP BY year
  ), holiday_totals AS (
    SELECT year(h.date)::INTEGER AS year,SUM(s.observation_rows) AS records,
      COUNT(*) FILTER(WHERE s.observation_rows IS NULL) AS missing
    FROM actual_dates h JOIN daily_db.species_region_holiday s ON s.date=h.date
    WHERE s.region_level='county' AND s.region_code=$1 AND s.taxon_id=$2
    GROUP BY year(h.date)
  ), checked AS (
    SELECT c.year,c.holiday_days,c.calendar_days-c.holiday_days AS non_holiday_days,
      COALESCE(r.records,0) AS annual_records,COALESCE(h.records,0) AS holiday_records,
      CASE
        WHEN p.year IS NULL THEN 'Annual processing metadata unavailable'
        WHEN c.holiday_days=0 OR c.holiday_days>=c.calendar_days THEN 'Holiday calendar unavailable'
        WHEN COALESCE(r.missing,0)>0 OR COALESCE(d.missing,0)>0 OR COALESCE(h.missing,0)>0 THEN 'Observation totals unavailable'
        WHEN COALESCE(r.records,0)<>COALESCE(d.records,0) THEN 'Annual summaries disagree'
        WHEN COALESCE(h.records,0)>COALESCE(r.records,0) OR COALESCE(h.records,0)<0 OR COALESCE(r.records,0)<0 THEN 'Observation totals inconsistent'
        ELSE NULL
      END AS unavailable_reason
    FROM calendar c
    CROSS JOIN selected_taxon CROSS JOIN selected_county
    LEFT JOIN reference_db.summary_completed_years p ON p.year=c.year
    LEFT JOIN annual_reference r ON r.year=c.year
    LEFT JOIN annual_daily d ON d.year=c.year
    LEFT JOIN holiday_totals h ON h.year=c.year
  )
  SELECT year,holiday_days,non_holiday_days,
    unavailable_reason IS NULL AS summary_available,unavailable_reason,
    CASE WHEN unavailable_reason IS NULL THEN annual_records END AS annual_observations,
    CASE WHEN unavailable_reason IS NULL THEN holiday_records END AS holiday_observations,
    CASE WHEN unavailable_reason IS NULL THEN annual_records-holiday_records END AS non_holiday_observations,
    CASE WHEN unavailable_reason IS NULL THEN holiday_records::DOUBLE/holiday_days END AS holiday_daily_average,
    CASE WHEN unavailable_reason IS NULL THEN (annual_records-holiday_records)::DOUBLE/non_holiday_days END AS non_holiday_daily_average
  FROM checked ORDER BY year
`;
