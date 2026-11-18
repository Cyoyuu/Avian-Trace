// Separate SQL allows calculation tests against a small in-memory database.
export const COUNTY_RICHNESS_SQL = `
  WITH richness AS (
    SELECT s.region_code,
      COUNT(DISTINCT s.taxon_id) AS species_richness,
      SUM(s.observation_rows) AS observation_records
    FROM species_region_year s
    JOIN taxa t ON t.taxon_id = s.taxon_id AND t.category = 'species'
    WHERE s.region_level = 'county'
      AND s.state_code = $1
      AND s.year BETWEEN $2 AND $3
      AND s.observation_rows > 0
    GROUP BY s.region_code
  )
  SELECT c.county_code AS region_code, COALESCE(c.county_name, c.county_code) AS county_name,
    COALESCE(r.species_richness, 0) AS species_richness,
    COALESCE(r.observation_records, 0) AS observation_records
  FROM counties c
  LEFT JOIN richness r ON r.region_code = c.county_code
  WHERE c.state_code = $1
    AND regexp_matches(c.county_code, '^US-[A-Z]{2}-[0-9]{3}$')
  ORDER BY c.county_name, c.county_code
`;
