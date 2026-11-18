import { CHART_FILTER_DEFINITIONS } from "../frontend/filters/filter-definitions.js";
import { validateSeasonalTrend } from "./species-trend-query.js";

export const HEATMAP_COVERAGE_SQL = `
  SELECT y.year::INTEGER AS year
  FROM range($1::INTEGER, $2::INTEGER + 1) y(year)
  LEFT JOIN summary_completed_years c ON c.year = y.year
  WHERE c.year IS NULL ORDER BY y.year
`;

export const SPECIES_HEATMAP_SQL = `
  WITH ranked AS (
    SELECT s.taxon_id, t.common_name AS species_name,
      SUM(s.observation_rows) AS total_observation_records
    FROM species_region_month s JOIN taxa t ON t.taxon_id = s.taxon_id
    WHERE s.region_level = $2 AND s.region_code = $1
      AND s.year BETWEEN $3 AND $4 AND s.month BETWEEN 1 AND 12
      AND t.category = 'species'
    GROUP BY s.taxon_id, t.common_name
    HAVING SUM(s.observation_rows) > 0
    ORDER BY total_observation_records DESC, lower(t.common_name), s.taxon_id
    LIMIT $5
  ), monthly AS (
    SELECT s.taxon_id, s.month, SUM(s.observation_rows) AS observation_records
    FROM species_region_month s JOIN ranked r ON r.taxon_id = s.taxon_id
    WHERE s.region_level = $2 AND s.region_code = $1
      AND s.year BETWEEN $3 AND $4 AND s.month BETWEEN 1 AND 12
    GROUP BY s.taxon_id, s.month
  )
  SELECT r.taxon_id, r.species_name, r.total_observation_records,
    m.month::INTEGER AS month, COALESCE(s.observation_records, 0) AS observation_records
  FROM ranked r CROSS JOIN range(1, 13) m(month)
  LEFT JOIN monthly s ON s.taxon_id = r.taxon_id AND s.month = m.month
  ORDER BY r.total_observation_records DESC, lower(r.species_name), r.taxon_id, m.month
`;

/** Do not rank incomplete year ranges or present partial totals as complete totals. */
export async function querySpeciesHeatmap(runQuery, regionCode, regionLevel, startYear, endYear, speciesCount) {
  validateSeasonalTrend(regionCode, regionLevel, startYear, endYear);
  if (!CHART_FILTER_DEFINITIONS.t2Heatmap.speciesCount.options.some(option => option.value === speciesCount)) {
    throw new Error("Invalid heatmap species count");
  }
  const coverage = await runQuery(HEATMAP_COVERAGE_SQL, [startYear, endYear]);
  const unavailableYears = coverage.data.map(row => Number(row.year));
  if (unavailableYears.length) return { data: { rows: [], unavailableYears }, queryTimeMs: coverage.queryTimeMs };
  const result = await runQuery(SPECIES_HEATMAP_SQL, [regionCode, regionLevel, startYear, endYear, speciesCount]);
  return {
    data: { rows: result.data, unavailableYears },
    queryTimeMs: (coverage.queryTimeMs || 0) + (result.queryTimeMs || 0)
  };
}
