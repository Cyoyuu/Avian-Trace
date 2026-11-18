import test from "node:test";
import assert from "node:assert/strict";
import { DuckDBInstance } from "@duckdb/node-api";
import { querySpeciesHeatmap, SPECIES_HEATMAP_SQL } from "../backend/species-heatmap-query.js";
import { buildSpeciesHeatmap } from "../frontend/charts/species-heatmap-data.js";
import { createFilterStore } from "../frontend/filters/filter-store.js";
import { getFilterEntries } from "../frontend/filters/filter-definitions.js";

test("heatmap ranks across all years/months before display sorting, with twelve explicit months", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const con = await instance.connect();
  try {
    await con.run(`
      CREATE TABLE summary_completed_years(year INTEGER PRIMARY KEY);
      INSERT INTO summary_completed_years VALUES (2012),(2013),(2015);
      CREATE TABLE taxa(taxon_id VARCHAR,common_name VARCHAR,category VARCHAR);
      INSERT INTO taxa SELECT 's'||i, CASE WHEN i=1 THEN 'Zebra Bird' WHEN i=22 THEN 'Aardvark Bird' ELSE 'Bird '||lpad(i::VARCHAR,2,'0') END, 'species' FROM range(1,23) species(i);
      INSERT INTO taxa VALUES ('g','Not a species','genus');
      CREATE TABLE species_region_month(year INTEGER,month INTEGER,region_level VARCHAR,region_code VARCHAR,taxon_id VARCHAR,observation_rows BIGINT);
      INSERT INTO species_region_month SELECT 2012,1,'state','US-MA','s'||i,(23-i)*10 FROM range(1,23) species(i);
      INSERT INTO species_region_month SELECT 2012,3,'state','US-MA','s'||i,(23-i)*5 FROM range(1,23) species(i);
      INSERT INTO species_region_month SELECT 2013,1,'state','US-MA','s'||i,(23-i)*2 FROM range(1,23) species(i);
      INSERT INTO species_region_month VALUES
        (2012,1,'state','US-MA','g',999999),
        (2011,1,'state','US-MA','s22',999999),
        (2012,13,'state','US-MA','s22',999999),
        (2012,1,'county','US-MA-017','s22',9999),
        (2012,1,'state','US-NY','s22',10000);
    `);
    const calls=[];
    const run=async(sql,params)=>{ calls.push(sql); return {data:(await con.runAndReadAll(sql,params)).getRowObjectsJson()}; };
    for(const count of [10,15,20]) {
      const result=await querySpeciesHeatmap(run,"US-MA","state",2012,2013,count);
      assert.deepEqual(result.data.unavailableYears,[]);
      assert.equal(result.data.rows.length,count*12);
      const species=buildSpeciesHeatmap(result.data.rows);
      assert.equal(species.length,count);
      assert.equal(species[0].taxonId,"s1");
      assert.equal(species[0].total,374);
      assert.equal(species[0].cells[0].observationRecords,264);
      assert.equal(species[0].cells[1].observationRecords,0);
      assert.equal(species[0].cells[2].observationRecords,110);
      assert.equal(species[0].cells.reduce((sum,cell)=>sum+cell.observationRecords,0),374);
      const alpha=buildSpeciesHeatmap(result.data.rows,"alpha");
      assert.equal(alpha.at(-1).speciesName,"Zebra Bird");
      assert.ok(!alpha.some(row=>row.speciesName==="Aardvark Bird"));
      assert.deepEqual(new Set(alpha.map(row=>row.taxonId)),new Set(species.map(row=>row.taxonId)));
    }
    const county=await querySpeciesHeatmap(run,"US-MA-017","county",2012,2013,10);
    assert.equal(county.data.rows.length,12);
    assert.equal(Number(county.data.rows[0].total_observation_records),9999);
    const other=await querySpeciesHeatmap(run,"US-NY","state",2012,2013,10);
    assert.equal(Number(other.data.rows[0].total_observation_records),10000);
    const oneYear=await querySpeciesHeatmap(run,"US-MA","state",2013,2013,10);
    assert.equal(Number(oneYear.data.rows[0].total_observation_records),44);
    assert.deepEqual((await querySpeciesHeatmap(run,"US-MA","state",2015,2015,15)).data.rows,[]);
    calls.length=0;
    const missing=await querySpeciesHeatmap(run,"US-MA","state",2012,2014,15);
    assert.deepEqual(missing.data,{rows:[],unavailableYears:[2014]});
    assert.equal(calls.length,1);
    assert.ok(!calls.includes(SPECIES_HEATMAP_SQL));
    for(const count of [5,11,25,"15",null]) await assert.rejects(()=>querySpeciesHeatmap(run,"US-MA","state",2012,2013,count),/Invalid/);
    await assert.rejects(()=>querySpeciesHeatmap(run,"US-MA","state",2012,2026,15),/Invalid/);
  } finally { con.closeSync(); instance.closeSync(); }
});

test("matrix preparation retains explicit zeros and marks missing cells unavailable without mutating rows",()=>{
  const rows=[
    {taxon_id:"a",species_name:"Alpha",total_observation_records:"7",month:1,observation_records:"7"},
    {taxon_id:"a",species_name:"Alpha",total_observation_records:"7",month:2,observation_records:"0"}
  ];
  const original=structuredClone(rows);
  const result=buildSpeciesHeatmap(rows);
  assert.equal(result[0].cells.length,12);
  assert.equal(result[0].cells[1].observationRecords,0);
  assert.equal(result[0].cells[2].observationRecords,null);
  assert.deepEqual(rows,original);
  assert.throws(()=>buildSpeciesHeatmap([...rows,rows[0]]),/duplicate/);
  assert.throws(()=>buildSpeciesHeatmap(rows,"desc"),/Invalid/);
  for(const value of [-1,1.5,"unknown",""]) assert.throws(()=>buildSpeciesHeatmap([{...rows[0],observation_records:value}]),/Invalid/);
  assert.throws(()=>buildSpeciesHeatmap([{...rows[0],month:13}]),/Invalid/);
});

test("heatmap controls are independent of selected species and trend season, while area/year changes remain shared",()=>{
  const store=createFilterStore();
  assert.deepEqual(store.getState().charts.t2Heatmap,{speciesCount:15,sortOrder:"total"});
  assert.deepEqual(getFilterEntries({chartId:"t2Heatmap"}).map(entry=>entry.path),[
    "shared.stateCode","shared.countyCode","shared.startYear","shared.endYear","charts.t2Heatmap.speciesCount","charts.t2Heatmap.sortOrder"
  ]);
  const heat=[],trend=[];
  store.subscribe({chartId:"t2Heatmap"},event=>heat.push(event));
  store.subscribe({chartId:"t2"},event=>trend.push(event));
  store.setShared({taxonId:"a"});
  store.setChart("t2",{season:"winter"});
  assert.equal(heat.length,0);
  store.setShared({stateCode:"US-MA",countyCode:"US-MA-017",startYear:2013});
  assert.equal(heat.length,1);
  const before=trend.length;
  for(const speciesCount of [10,15,20]) store.setChart("t2Heatmap",{speciesCount});
  store.setChart("t2Heatmap",{sortOrder:"alpha"});
  assert.equal(trend.length,before);
  for(const speciesCount of [5,11,25,"15"]) assert.throws(()=>store.setChart("t2Heatmap",{speciesCount}),/Invalid/);
  assert.equal(store.getFilters("t2").season,"winter");
  assert.equal(store.getFilters("t2").taxonId,"a");
});
