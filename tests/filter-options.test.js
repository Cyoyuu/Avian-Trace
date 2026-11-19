import test from "node:test";
import assert from "node:assert/strict";
import { createFilterOptions } from "../frontend/helpers/filter-options.js";
test("filter options retain geographic IDs/names and optional taxon and supported-state choices",()=>{
  const geography=[{region_level:"state",region_code:"US-MA",region_name:"Massachusetts"},{region_level:"state",region_code:"US-NY",region_name:"New York"},{region_level:"county",region_code:"US-MA-017",region_name:"Middlesex"}];
  const options=createFilterOptions(geography,new Map([["taxon","Bird"]]),{stateCodes:["US-MA"]});
  assert.deepEqual(options.stateCode,[{value:"US-MA",label:"Massachusetts"}]);
  assert.deepEqual(options.countyCode,[{value:"US-MA-017",label:"Middlesex"}]);
  assert.deepEqual(options.taxonId,[{value:"taxon",label:"Bird"}]);
  assert.equal(createFilterOptions(geography).stateCode.length,2);
  assert.equal(Object.hasOwn(createFilterOptions(geography),"taxonId"),false);
});
