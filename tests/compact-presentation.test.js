import test from "node:test";
import assert from "node:assert/strict";
import { getCountyBarLayout, sortCountyRichness } from "../frontend/visualizations/t1/county-richness-bar-data.js";
test("compact county layout bounds height while retaining slots for every county",()=>{
  const rows=Array.from({length:254},(_,index)=>({countyName:"A very long county name "+index}));
  const layout=getCountyBarLayout(rows,600,{presentation:"compact",availableHeight:280});
  assert.ok(layout.width>600);assert.ok(layout.height<=280);assert.ok(layout.plotHeight>=85);
  assert.equal(layout.width,layout.left+rows.length*36+layout.right);
  const resized=getCountyBarLayout(rows,700,{presentation:"compact",availableHeight:340});
  assert.ok(resized.plotHeight>layout.plotHeight);
  assert.ok(getCountyBarLayout(rows,600).plotHeight===400);
});
test("presentation sizing leaves numeric richness sorting and input records unchanged",()=>{
  const rows=[{region_code:"US-MA-001",county_name:"Alpha",species_richness:"5",observation_records:"12"},{region_code:"US-MA-003",county_name:"Beta",species_richness:"20",observation_records:"30"}];
  const original=structuredClone(rows);const sorted=sortCountyRichness(rows,"desc");
  getCountyBarLayout(sorted,700,{presentation:"compact",availableHeight:280});
  assert.deepEqual(sorted.map(row=>row.speciesRichness),[20,5]);assert.deepEqual(rows,original);
});
