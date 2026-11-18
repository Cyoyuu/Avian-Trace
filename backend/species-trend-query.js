import { CHART_FILTER_DEFINITIONS, SHARED_FILTER_DEFINITIONS } from "../frontend/filters/filter-definitions.js";

// The existing definitions are plain metadata: use the same month sets on both sides.
export function getTrendMonths(season) {
  const definition = CHART_FILTER_DEFINITIONS.t2.season.options.find(option => option.value === season);
  if (!definition) throw new Error("Invalid season");
  return definition.months;
}

export function validateSeasonalTrend(regionCode, regionLevel, startYear, endYear) {
  const pattern = regionLevel === "state" ? /^US-[A-Z]{2}$/ : /^US-[A-Z]{2}-\d{3}$/;
  if (!["state", "county"].includes(regionLevel) || !pattern.test(regionCode)) throw new Error("Invalid region code or level");
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear > endYear ||
      startYear < SHARED_FILTER_DEFINITIONS.startYear.min || endYear > SHARED_FILTER_DEFINITIONS.endYear.max) {
    throw new Error("Invalid year range for complete-year seasonal summaries");
  }
}

// Return every requested year. Completed-but-absent species records are zero;
// a missing processing marker is unavailable, even if partial rows exist.
export const SEASONAL_SPECIES_TREND_SQL = `
  WITH selected_taxon AS (
    SELECT taxon_id FROM taxa WHERE taxon_id = $3 AND category = 'species'
  ), selected_region AS (
    SELECT state_code AS region_code FROM states WHERE $2 = 'state' AND state_code = $1
    UNION ALL
    SELECT county_code FROM counties WHERE $2 = 'county' AND county_code = $1
  ), totals AS (
    SELECT s.year, SUM(s.observation_rows) AS observation_records
    FROM species_region_month s
    JOIN selected_taxon t ON t.taxon_id = s.taxon_id
    WHERE s.region_level = $2 AND s.region_code = $1
      AND s.year BETWEEN $4 AND $5
      AND list_contains(string_split($6, ','), CAST(s.month AS VARCHAR))
    GROUP BY s.year
  )
  SELECT y.year::INTEGER AS year,
    CASE WHEN c.year IS NULL THEN NULL
      ELSE COALESCE(t.observation_records, 0) END AS observation_records,
    c.year IS NOT NULL AS summary_available
  FROM range($4::INTEGER, $5::INTEGER + 1) y(year)
  CROSS JOIN selected_taxon
  CROSS JOIN selected_region
  LEFT JOIN summary_completed_years c ON c.year = y.year
  LEFT JOIN totals t ON t.year = y.year
  ORDER BY y.year
`;
