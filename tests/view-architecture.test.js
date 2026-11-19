import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
const entries = [
  ["county-choropleth","t1","mountCountyChoropleth"],
  ["county-richness-bar","t1","mountCountyRichnessBar"],
  ["observation-trends","t2","mountObservationTrends"],
  ["seasonal-species-heatmap","t2","mountSeasonalSpeciesHeatmap"],
  ["holiday-observation-patterns","t3","mountHolidayObservationPatterns"],
  ["location-combinations","t4","mountLocationCombinations"],
  ["hotspot-species-overlap","t4","mountHotspotSpeciesOverlap"]
];
test("all seven view modules import without a browser or standalone initialization",async()=>{
  for(const [name,task,exportName] of entries){
    const url=new URL("../frontend/visualizations/"+task+"/"+name+"-view.js",import.meta.url);
    const module=await import(url.href);assert.equal(typeof module[exportName],"function");
    const source=await readFile(url,"utf8");assert.doesNotMatch(source,/document\.querySelector|history\.|location\.search|createFilterStore/);
  }
});
test("standalone URLs retain their HTML files and load their thin page initializers",async()=>{
  for(const [name] of entries){
    const html=await readFile(new URL("../frontend/"+name+".html",import.meta.url),"utf8");
    assert.ok(html.includes('src="pages/'+name+'.js"'));
    await stat(new URL("../frontend/pages/"+name+".js",import.meta.url));
    for(const match of html.matchAll(/(?:src|href)="([^\"]+)"/g)){
      if(match[1].includes(":")||match[1].startsWith("#"))continue;
      await stat(new URL("../frontend/"+match[1].split("?")[0],import.meta.url));
    }
  }
});
test("moved frontend modules have no broken relative imports",async()=>{
  async function walk(directory){
    const files=[];for(const entry of await readdir(directory,{withFileTypes:true})){
      const url=new URL(entry.name+(entry.isDirectory()?"/":""),directory);
      if(entry.isDirectory())files.push(...await walk(url));else if(entry.name.endsWith(".js"))files.push(url);
    }return files;
  }
  for(const file of await walk(new URL("../frontend/",import.meta.url))){
    const source=await readFile(file,"utf8");
    for(const match of source.matchAll(/(?:from\s+|import\s*)["'](\.[^"']+)["']/g))await stat(new URL(match[1],file));
  }
});
