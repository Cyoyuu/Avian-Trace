import { mountCountyRichnessBar } from "/visualizations/t1/county-richness-bar-view.js";
import { mountCountyChoropleth } from "/visualizations/t1/county-choropleth-view.js";
import { mountObservationTrends } from "/visualizations/t2/observation-trends-view.js";
import { mountSeasonalSpeciesHeatmap } from "/visualizations/t2/seasonal-species-heatmap-view.js";
import { mountHolidayObservationPatterns } from "/visualizations/t3/holiday-observation-patterns-view.js";
import { mountLocationCombinations } from "/visualizations/t4/location-combinations-view.js";
import { mountHotspotSpeciesOverlap } from "/visualizations/t4/hotspot-species-overlap-view.js";
export const compactCases = [
  {id:"map",label:"T1 County Choropleth",mount:mountCountyChoropleth,chartId:"t1Map",width:1088,height:360,selector:".county-choropleth__map .county"},
  {id:"bars",label:"T1 County Richness Bars",mount:mountCountyRichnessBar,chartId:"t1",width:784,height:360,selector:".county-bars__county"},
  {id:"trends",label:"T2 Observation Trends",mount:mountObservationTrends,chartId:"t2",width:936,height:240,selector:".observation-trends__point"},
  {id:"holiday",label:"T3 Holiday Patterns",mount:mountHolidayObservationPatterns,chartId:"t3",width:936,height:240,selector:".holiday-patterns__year"},
  {id:"combinations",label:"T4 Combination Bars",mount:mountLocationCombinations,chartId:"t4",width:1104,height:324,selector:".combination-chart__combination"},
  {id:"heatmap",label:"T2 Seasonal Heatmap",mount:mountSeasonalSpeciesHeatmap,chartId:"t2Heatmap",width:768,height:324,selector:".species-heatmap__cell"},
  {id:"upset",label:"T4 UpSet",mount:mountHotspotSpeciesOverlap,chartId:"t4UpSet",width:768,height:324,selector:".upset-chart__column"}
];
