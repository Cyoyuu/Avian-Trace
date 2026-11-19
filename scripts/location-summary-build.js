// Shared by the offline builder and fixture tests; HTTP requests never execute this SQL.
export const CREATE_LOCATION_STAGING_SQL = `
  CREATE TABLE IF NOT EXISTS location_build_files (name VARCHAR PRIMARY KEY, bytes BIGINT, modified VARCHAR);
  CREATE TABLE IF NOT EXISTS location_parts (county_code VARCHAR, locality_id VARCHAR, locality_name VARCHAR);
  CREATE TABLE IF NOT EXISTS species_parts (county_code VARCHAR, locality_id VARCHAR, taxon_id VARCHAR);
`;

export const READ_HOTSPOT_FILE_SQL = `
  CREATE OR REPLACE TEMP TABLE file_hotspots AS
  SELECT DISTINCT p.county_code,p.locality_id,p.taxon_id,NULLIF(TRIM(p.locality_name),'') AS locality_name
  FROM read_parquet($1) p
  JOIN reference_db.counties c ON c.county_code=p.county_code
  JOIN reference_db.taxa t ON t.taxon_id=p.taxon_id AND t.category='species'
  WHERE p.locality_type='H' AND p.category='species'
    AND p.observation_date BETWEEN '2012-01-01' AND '2025-12-31'
    AND regexp_full_match(p.locality_id,'L[0-9]+')
`;

export const STAGE_HOTSPOTS_SQL = `
  INSERT INTO location_parts SELECT county_code,locality_id,MIN(locality_name) FROM file_hotspots GROUP BY county_code,locality_id;
  INSERT INTO species_parts SELECT DISTINCT county_code,locality_id,taxon_id FROM file_hotspots;
`;

export const FINALIZE_LOCATIONS_SQL = `
  CREATE OR REPLACE TABLE location_species AS
    SELECT DISTINCT county_code,locality_id,taxon_id FROM species_parts ORDER BY county_code,locality_id,taxon_id;
  CREATE OR REPLACE TABLE locations AS
    SELECT m.county_code,m.locality_id,COALESCE(n.locality_name,m.locality_id) AS locality_name,COUNT(*)::INTEGER AS species_richness
    FROM location_species m
    LEFT JOIN (SELECT county_code,locality_id,MIN(locality_name) AS locality_name FROM location_parts GROUP BY county_code,locality_id) n
    USING(county_code,locality_id)
    GROUP BY m.county_code,m.locality_id,n.locality_name ORDER BY m.county_code,locality_name,m.locality_id;
  CREATE TABLE build_metadata AS SELECT 1 AS version,2012 AS start_year,2025 AS end_year,'H' AS locality_type,TRUE AS complete;
  DROP TABLE location_parts;
  DROP TABLE species_parts;
`;
