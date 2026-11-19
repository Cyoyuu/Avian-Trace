import test from "node:test";
import assert from "node:assert/strict";
import { DuckDBInstance } from "@duckdb/node-api";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CREATE_LOCATION_STAGING_SQL, READ_HOTSPOT_FILE_SQL, STAGE_HOTSPOTS_SQL, FINALIZE_LOCATIONS_SQL } from "../scripts/location-summary-build.js";
import { createLocationQueries, validateCandidateIds } from "../backend/location-queries.js";
import { buildLocationCombinations, sortLocationCombinations, pageLocationCombinations } from "../frontend/charts/location-combinations-data.js";
import { createFilterStore } from "../frontend/filters/filter-store.js";

const location = (id, species, name = id) => ({ locality_id: id, locality_name: name, species_ids: species });

test("offline preparation includes only H species records in 2012–2025 and preserves locality identity", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "avian-hotspots-"));
  const db = await DuckDBInstance.create(":memory:"); const c = await db.connect();
  try {
    await c.run("ATTACH ':memory:' AS reference_db; CREATE TABLE reference_db.counties(county_code VARCHAR); INSERT INTO reference_db.counties VALUES ('US-MA-017'),('US-MA-025'); CREATE TABLE reference_db.taxa(taxon_id VARCHAR,category VARCHAR); INSERT INTO reference_db.taxa VALUES ('a','species'),('b','species'),('c','species'),('x','hybrid');");
    await c.run("CREATE TABLE raw(county_code VARCHAR,locality_id VARCHAR,locality_name VARCHAR,locality_type VARCHAR,taxon_id VARCHAR,category VARCHAR,observation_date VARCHAR)");
    const rows = [
      ['US-MA-017','L1','Same name','H','a','species','2012-01-01'],
      ['US-MA-017','L1','Same name','H','a','species','2025-12-31'],
      ['US-MA-017','L1','Renamed','H','b','species','2020-01-01'],
      ['US-MA-017','L2','Same name','H','b','species','2020-01-01'],
      ['US-MA-017','L3','Private (restricted access)','H','c','species','2020-01-01'],
      ['US-MA-025','L4','Other county','H','a','species','2020-01-01'],
      ...['P','T','PC','C','S','',null].map((type,index) => ['US-MA-017','L'+(10+index),'Excluded',type,'a','species','2020-01-01']),
      ['US-MA-017','L30','Early','H','a','species','2011-12-31'],
      ['US-MA-017','L31','Partial','H','a','species','2026-01-01'],
      ['US-MA-017','L32','Hybrid','H','x','hybrid','2020-01-01'],
      ['US-MA-017','L33','Unknown taxon','H','missing','species','2020-01-01'],
      ['US-MA-999','L34','Unknown county','H','a','species','2020-01-01'],
      ['US-MA-017','','No ID','H','a','species','2020-01-01']
    ];
    for (const row of rows) await c.run("INSERT INTO raw VALUES ($1,$2,$3,$4,$5,$6,$7)",row);
    const file = path.join(directory,"fixture.parquet").replaceAll("\\","/").replaceAll("'","''");
    await c.run("COPY raw TO '" + file + "' (FORMAT PARQUET)");
    await c.run(CREATE_LOCATION_STAGING_SQL);
    await c.run(READ_HOTSPOT_FILE_SQL,[file]);
    await c.run(STAGE_HOTSPOTS_SQL);
    await c.run(STAGE_HOTSPOTS_SQL); // Cross-file duplicate memberships must also collapse.
    await c.run(FINALIZE_LOCATIONS_SQL);
    const q = createLocationQueries(c);
    const catalog = await q.search('US-MA-017');
    assert.equal(catalog.total,3);
    assert.equal(catalog.locations.find(row => row.locality_id==='L1').species_richness,2);
    assert.equal((await q.search('US-MA-017','private')).total,1); // H does not establish public access.
    const members = await q.memberships('US-MA-017',['L1','L2','L3']);
    assert.equal(buildLocationCombinations(members,3)[0].richness,3);
    assert.deepEqual(members[0].species_ids,['a','b']);
    const independent = (await c.runAndReadAll("SELECT COUNT(DISTINCT taxon_id) AS richness FROM raw WHERE county_code='US-MA-017' AND locality_id IN ('L1','L2','L3') AND locality_type='H' AND category='species' AND observation_date BETWEEN '2012-01-01' AND '2025-12-31'")).getRowObjectsJson();
    assert.equal(Number(independent[0].richness),3);
    await assert.rejects(q.memberships('US-MA-017',['L4']), /not present/);
    await assert.rejects(q.search('invalid'), /Invalid county/);
    await assert.rejects(q.search('US-MA-017','',0), /Invalid/);
    assert.equal((await q.search('US-MA-017',"%' OR 1=1 --")).total,0);
    for (let index=100;index<155;index++) await c.run("INSERT INTO locations VALUES ('US-MA-017',$1,'Paged hotspot',1)",['L'+index]);
    assert.equal((await q.search('US-MA-017')).locations.length,50);
    assert.equal((await q.search('US-MA-017','',2)).locations.length,8);
    assert.equal((await q.search('US-MA-017','',3)).locations.length,0);
  } finally { c.closeSync();db.closeSync();await rm(directory,{recursive:true,force:true}); }
});

test("exact unions, deterministic sorting, maximum ties and 50-row pages preserve every combination", () => {
  const input = [location('L1',['a','a'],'Same'),location('L2',['b'],'Same'),location('L3',['a','b'],'Third'),location('L4',['c'],'Fourth')];
  const copy = structuredClone(input);
  const rows = buildLocationCombinations(input,3);
  assert.equal(rows.length,4);
  assert.equal(rows.find(row=>row.key==='L1|L2|L3').richness,2);
  assert.equal(rows.filter(row=>row.isBest).length,3);
  assert.deepEqual(sortLocationCombinations(rows,'asc').map(row=>row.richness),[2,3,3,3]);
  assert.deepEqual(sortLocationCombinations(rows,'desc').map(row=>row.richness),[3,3,3,2]);
  assert.deepEqual(sortLocationCombinations(rows,'alpha'),sortLocationCombinations([...rows].reverse(),'alpha'));
  assert.deepEqual(input,copy);
  const ten = Array.from({length:10},(_,i)=>location('L'+(i+1),['shared','s'+i]));
  for(const [size,count] of [[3,120],[4,210],[5,252]]) {
    const result=buildLocationCombinations(ten,size);
    assert.equal(result.length,count);assert.equal(new Set(result.map(row=>row.key)).size,count);
    assert.ok(result.every(row=>row.locationIds.length===size && row.richness===size+1));
    const pages=[];for(let page=1;page<=Math.ceil(count/50);page++)pages.push(...pageLocationCombinations(result,page).rows);
    assert.deepEqual(pages,result);
  }
  assert.equal(pageLocationCombinations(buildLocationCombinations(ten,5),6).rows.length,2);
  assert.equal(pageLocationCombinations(rows,100).page,1);
  assert.deepEqual(buildLocationCombinations([],3),[]);
  assert.equal(buildLocationCombinations([location('L1',[]),location('L2',[]),location('L3',[])],3)[0].richness,0);
  assert.throws(()=>buildLocationCombinations([...ten,location('L11',[])],3));
  assert.throws(()=>buildLocationCombinations([ten[0],ten[0]],3));
  assert.throws(()=>buildLocationCombinations(ten,2));
  assert.throws(()=>sortLocationCombinations(rows,'random'));
  for(const bad of [[],['L1','L1'],['personal'],Array.from({length:11},(_,i)=>'L'+i)]) assert.throws(()=>validateCandidateIds(bad));
});

test("T4 selections are immutable, bounded and atomic, and unrelated filters remain independent", () => {
  const store=createFilterStore(); const events=[]; const other=[];
  store.subscribe({chartId:'t4'},event=>events.push(event));
  store.subscribe({chartId:'t2'},event=>other.push(event));
  assert.throws(()=>store.setChart('t4',{candidateLocationIds:['L1']}));
  store.setShared({stateCode:'US-MA',countyCode:'US-MA-017'});
  const input=['L3','L1','L2','L4'];store.setChart('t4',{candidateLocationIds:input});input.push('L99');
  assert.deepEqual(store.getFilters('t4').candidateLocationIds,['L1','L2','L3','L4']);
  store.setChart('t4',{selectedCombinationIds:['L3','L1','L2']});
  const count=events.length;
  store.setChart('t4',{candidateLocationIds:['L4','L2','L1','L3'],selectedCombinationIds:['L2','L3','L1']});
  assert.equal(events.length,count);
  assert.throws(()=>store.setChart('t4',{selectedCombinationIds:['L1','L2','L99']}));
  assert.throws(()=>store.setChart('t4',{candidateLocationIds:Array.from({length:11},(_,i)=>'L'+i)}));
  store.setChart('t4',{sortOrder:'asc'});assert.equal(store.getFilters('t4').selectedCombinationIds.length,3);
  store.setChart('t4',{numberOfLocations:4});assert.deepEqual(store.getFilters('t4').selectedCombinationIds,[]);
  store.setChart('t4',{numberOfLocations:3,selectedCombinationIds:['L1','L2','L3']});
  store.setChart('t4',{candidateLocationIds:['L1','L2','L4']});assert.deepEqual(store.getFilters('t4').selectedCombinationIds,[]);
  const before=events.length;store.setShared({taxonId:'species',startYear:2020,endYear:2024});store.setChart('t2',{season:'winter'});assert.equal(events.length,before);
  store.setShared({countyCode:'US-MA-025'});
  assert.deepEqual(events.at(-1).filters.candidateLocationIds,[]);
  assert.ok(events.at(-1).changedKeys.includes('charts.t4.candidateLocationIds'));
  assert.ok(Object.isFrozen(store.getFilters('t4').candidateLocationIds));
  assert.equal(other.length,4); // state/county context, years/species, season, county change
});
