import test from "node:test";
import assert from "node:assert/strict";
import { DuckDBInstance } from "@duckdb/node-api";
import { feature } from "topojson-client";
import { readFileSync } from "node:fs";
import { COUNTY_RICHNESS_SQL } from "../backend/county-richness-query.js";
import { joinCountyRichness } from "../frontend/visualizations/t1/county-choropleth-data.js";
import { getCountiesByStateId, getCountyIdFromRegionCode } from "../frontend/helpers/location-converter.js";
import { STATE_ABBREVIATIONS } from "../frontend/helpers/geographic-codes.js";
import { createFilterStore } from "../frontend/filters/filter-store.js";
import { getFilterEntries } from "../frontend/filters/filter-definitions.js";

test("county metrics count distinct species across years and sum only species-category records", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  try {
    await connection.run(`
      CREATE TABLE taxa(taxon_id VARCHAR, category VARCHAR);
      INSERT INTO taxa VALUES ('a','species'),('b','species'),('c','issf'),('d','hybrid'),('e','species');
      CREATE TABLE counties(state_code VARCHAR, county_code VARCHAR, county_name VARCHAR);
      INSERT INTO counties VALUES ('US-MA','US-MA-001','First'),('US-MA','US-MA-003',NULL),('US-NY','US-NY-001','Other state');
      CREATE TABLE species_region_year(region_level VARCHAR, state_code VARCHAR, region_code VARCHAR, year INTEGER, taxon_id VARCHAR, observation_rows BIGINT);
      INSERT INTO species_region_year VALUES
        ('county','US-MA','US-MA-001',2012,'a',3),
        ('county','US-MA','US-MA-001',2013,'a',7),
        ('county','US-MA','US-MA-001',2013,'b',4),
        ('county','US-MA','US-MA-001',2013,'c',100),
        ('county','US-MA','US-MA-001',2013,'d',100),
        ('county','US-MA','US-MA-001',2011,'b',800),
        ('county','US-MA','US-MA-001',2026,'a',30),
        ('county','US-MA','US-MA-003',2012,'e',0),
        ('state','US-MA','US-MA',2012,'a',200),
        ('county','US-NY','US-NY-001',2012,'a',100);
    `);
    const read = async (state, start, end) => (await connection.runAndReadAll(COUNTY_RICHNESS_SQL, [state, start, end])).getRowObjectsJson();
    const rows = await read("US-MA", 2012, 2025);
    assert.equal(rows.length, 2);
    const first = rows.find(row => row.region_code === "US-MA-001");
    assert.equal(Number(first.species_richness), 2);
    assert.equal(Number(first.observation_records), 14);
    const empty = rows.find(row => row.region_code === "US-MA-003");
    assert.equal(empty.county_name, "US-MA-003");
    assert.equal(Number(empty.species_richness), 0);
    assert.equal(Number(empty.observation_records), 0);
    const singleYear = (await read("US-MA", 2012, 2012)).find(row => row.region_code === "US-MA-001");
    assert.equal(Number(singleYear.species_richness), 1);
    assert.equal(Number(singleYear.observation_records), 3);
    const other = await read("US-NY", 2012, 2025);
    assert.equal(other.length, 1);
    assert.equal(Number(other[0].observation_records), 100);
    assert.deepEqual(await read("US-ZZ", 2012, 2025), []);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
});

test("joining metrics preserves every polygon, numeric zeros, and missing-data distinctions", () => {
  const counties = { type: "FeatureCollection", features: ["25001", "25003", "25005"].map((id, index) => ({
    type: "Feature", id, geometry: null, properties: { name: "County " + index }
  })) };
  const original = structuredClone(counties);
  const joined = joinCountyRichness(counties, "US-MA", [
    { region_code: "US-MA-001", county_name: "First County", species_richness: "2", observation_records: "14" },
    { region_code: "US-MA-003", county_name: "Empty County", species_richness: "0", observation_records: "0" }
  ]);
  assert.equal(joined.features.length, 3);
  assert.equal(joined.features[0].properties.speciesRichness, 2);
  assert.equal(joined.features[0].properties.observationRecords, 14);
  assert.equal(joined.features[1].properties.speciesRichness, 0);
  assert.equal(joined.features[2].properties.speciesRichness, null);
  assert.equal(joined.features[2].properties.observationRecords, null);
  assert.deepEqual(counties, original);
});

test("bundled county geometry reuses existing state filtering and code conversion without chart side effects", () => {
  const topology = JSON.parse(readFileSync(new URL("../frontend/data/counties-10m.json", import.meta.url), "utf8"));
  const counties = feature(topology, topology.objects.counties);
  const ma = getCountiesByStateId("25", counties);
  assert.equal(ma.features.length, 14);
  assert.ok(ma.features.every(county => String(county.id).startsWith("25")));
  assert.equal(getCountiesByStateId("48", counties).features.length, 254);
  assert.equal(getCountyIdFromRegionCode("US-MA-017"), "25017");
  assert.equal(STATE_ABBREVIATIONS["25"], "MA");
});

test("choropleth standalone definitions omit sorting; unrelated changes do not notify the map", () => {
  assert.deepEqual(getFilterEntries({ chartId: "t1Map" }).map(entry => entry.path), ["shared.stateCode", "shared.countyCode"]);
  const store = createFilterStore();
  const events = [];
  const unsubscribe = store.subscribe({ chartId: "t1Map" }, event => events.push(event));
  store.setShared({ stateCode: "US-MA", countyCode: "US-MA-017" });
  store.setChart("t1", { sortOrder: "alpha" });
  store.setShared({ taxonId: "avibase-4E74AE22", startYear: 2015 });
  assert.equal(events.length, 1);
  store.setShared({ countyCode: "US-MA-025" });
  assert.equal(events.length, 2);
  assert.equal(events[1].filters.stateCode, "US-MA");
  store.setShared({ stateCode: "US-NY" });
  assert.equal(events[2].filters.countyCode, null);
  unsubscribe();
  store.setShared({ stateCode: "US-MA" });
  assert.equal(events.length, 3);
});
