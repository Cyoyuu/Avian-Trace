import test from "node:test";
import assert from "node:assert/strict";
import { DuckDBInstance } from "@duckdb/node-api";
import { buildExclusiveIntersections } from "../frontend/visualizations/t4/hotspot-overlap-data.js";
import { parseHotspotOverlapSelection, hotspotOverlapUrl, validateLoadedHotspots } from "../frontend/visualizations/t4/hotspot-overlap-selection.js";
import { createFilterStore } from "../frontend/filters/filter-store.js";
import { getFilterEntries } from "../frontend/filters/filter-definitions.js";
const location = (id,species,name=id) => ({locality_id:id,locality_name:name,species_ids:species});
const geography = [{region_level:"state",region_code:"US-MA"},{region_level:"county",region_code:"US-MA-017"},{region_level:"county",region_code:"US-MA-025"}];

test("exclusive intersections partition every species for all 3–5 hotspot counts and all membership patterns", async()=>{
  const db=await DuckDBInstance.create(":memory:");const c=await db.connect();
  try {
    for(const count of [3,4,5]) {
      const rows=Array.from({length:count},(_,index)=>location("L"+(index+1),[],"Hotspot "+index));
      for(let mask=1;mask<(1<<count);mask++)for(let index=0;index<count;index++)if(mask&(1<<index))rows[index].species_ids.push("species-"+mask,"species-"+mask);
      const input=structuredClone(rows);const result=buildExclusiveIntersections(rows);
      assert.equal(result.unionRichness,(1<<count)-1);
      assert.equal(result.intersections.length,(1<<count)-1);
      assert.ok(result.intersections.every(row=>row.count===1));
      assert.equal(result.intersections.reduce((sum,row)=>sum+row.count,0),result.unionRichness);
      assert.deepEqual(rows,input);
      await c.run("CREATE OR REPLACE TABLE membership(location_id VARCHAR,taxon_id VARCHAR,weight INTEGER)");
      for(const [index,row] of result.locations.entries())for(const taxon of rows.find(item=>item.locality_id===row.id).species_ids)await c.run("INSERT INTO membership VALUES ($1,$2,$3)",[row.id,taxon,2**index]);
      const expected=(await c.runAndReadAll("WITH masks AS (SELECT taxon_id,SUM(DISTINCT weight)::INTEGER AS mask FROM membership GROUP BY taxon_id) SELECT mask,COUNT(*)::INTEGER AS count FROM masks GROUP BY mask ORDER BY count DESC,mask")).getRowObjectsJson();
      assert.deepEqual(result.intersections.map(({mask,count})=>({mask,count})),expected);
    }
  } finally {c.closeSync();db.closeSync();}
});

test("overlapping, disjoint, identical and empty sets have exact exclusive counts and no duplicate-taxon inflation",()=>{
  const overlap=buildExclusiveIntersections([location('L1',['a','b','c','c'],'Same'),location('L2',['b','c','d'],'Same'),location('L3',['c','e'],'Third')]);
  assert.equal(overlap.unionRichness,5);
  assert.deepEqual(overlap.intersections.map(row=>[row.mask,row.count]),[[1,1],[2,1],[3,1],[4,1],[7,1]]);
  assert.deepEqual(overlap.locations.map(row=>row.richness),[3,3,2]);
  const disjoint=buildExclusiveIntersections([location('L1',['a','b']),location('L2',['c']),location('L3',['d'])]);
  assert.deepEqual(disjoint.intersections.map(row=>[row.mask,row.count]),[[1,2],[2,1],[4,1]]);
  const identical=buildExclusiveIntersections(Array.from({length:5},(_,index)=>location('L'+index,['a','b','a'])));
  assert.deepEqual(identical.intersections.map(row=>[row.mask,row.count]),[[31,2]]);
  const empty=buildExclusiveIntersections(Array.from({length:3},(_,index)=>location('L'+index,[])));
  assert.equal(empty.unionRichness,0);assert.deepEqual(empty.intersections,[]);
  assert.throws(()=>buildExclusiveIntersections([location('L1',[]),location('L2',[])]));
  assert.throws(()=>buildExclusiveIntersections(Array.from({length:6},(_,index)=>location('L'+index,[]))));
  assert.throws(()=>buildExclusiveIntersections([location('L1',[]),location('L1',[]),location('L3',[])]));
  assert.throws(()=>buildExclusiveIntersections([location('L1',null),location('L2',[]),location('L3',[])]));
  assert.throws(()=>buildExclusiveIntersections([location('L1',['']),location('L2',[]),location('L3',[])]));
});

test("URL selection uses canonical locality IDs and rejects malformed, repeated, mismatched or unknown parameters",()=>{
  for(const count of [3,4,5]) {
    const selection={stateCode:'US-MA',countyCode:'US-MA-017',locationIds:Array.from({length:count},(_,index)=>'L'+(count-index))};
    const url=hotspotOverlapUrl(selection);
    assert.ok(url.startsWith('hotspot-species-overlap.html?'));
    assert.deepEqual(parseHotspotOverlapSelection(url.slice(url.indexOf('?')),geography),{...selection,locationIds:[...selection.locationIds].sort()});
  }
  assert.equal(parseHotspotOverlapSelection('',geography),null);
  assert.equal(parseHotspotOverlapSelection('?countyCode=US-MA-017&locationIds=L1,L2,L3',geography).stateCode,'US-MA');
  for(const query of [
    '?stateCode=US-MA', '?countyCode=US-MA-017', '?countyCode=US-MA-017&locationIds=L1,L2',
    '?countyCode=US-MA-017&locationIds=L1,L2,L3,L4,L5,L6', '?countyCode=US-MA-017&locationIds=L1,L1,L2',
    '?countyCode=US-MA-017&locationIds=Home,L2,L3', '?countyCode=US-MA-017&locationIds=L1,L2,L3&locationIds=L4,L5,L6',
    '?countyCode=US-MA-017&stateCode=US-NY&locationIds=L1,L2,L3', '?countyCode=US-MA-999&locationIds=L1,L2,L3',
    '?countyCode=US-MA-017&locationIds=L1,L2,L3&extra=unexpected'
  ])assert.throws(()=>parseHotspotOverlapSelection(query,geography),query);
  const rows=[location('L1',[]),location('L2',[]),location('L3',[])];
  assert.equal(validateLoadedHotspots(rows,['L1','L2','L3']),rows);
  assert.throws(()=>validateLoadedHotspots(rows,['L1','L2','L4']));
  assert.throws(()=>validateLoadedHotspots(rows.slice(0,2),['L1','L2','L3']));
  assert.throws(()=>validateLoadedHotspots([rows[0],rows[0],rows[2]],['L1','L2','L3']));
});

test("UpSet reuses T4 IDs, retains standalone header scopes and clears incompatible county selections atomically",()=>{
  const store=createFilterStore();const events=[];
  store.subscribe({keys:['shared.stateCode','shared.countyCode','charts.t4.candidateLocationIds']},event=>events.push(event));
  store.setShared({stateCode:'US-MA',countyCode:'US-MA-017'});
  store.setChart('t4',{candidateLocationIds:['L1','L2','L3'],selectedCombinationIds:['L1','L2','L3']});
  const url=hotspotOverlapUrl({...store.getFilters('t4'),locationIds:store.getFilters('t4').selectedCombinationIds});
  assert.equal(parseHotspotOverlapSelection(url.split('?')[1],geography).locationIds.length,3);
  const count=events.length;
  store.setShared({taxonId:'taxon',startYear:2020});store.setChart('t2',{season:'winter'});store.setChart('t4',{sortOrder:'asc',numberOfLocations:5});
  assert.equal(events.length,count);
  store.setShared({countyCode:'US-MA-025'});
  assert.deepEqual(store.getFilters('t4').candidateLocationIds,[]);assert.deepEqual(store.getFilters('t4').selectedCombinationIds,[]);
  assert.ok(events.at(-1).changedKeys.includes('charts.t4.candidateLocationIds'));
  assert.deepEqual(getFilterEntries({chartId:'t4UpSet'}).map(row=>row.key),['stateCode','countyCode']);
  assert.deepEqual(getFilterEntries({chartId:'t4UpSet',scope:'chart'}),[]);
  assert.deepEqual(getFilterEntries({chartId:'t4UpSet',scope:'shared'}),getFilterEntries({chartId:'t4UpSet'}));
});
