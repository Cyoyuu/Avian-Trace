import { compactCases } from "./compact-cases.js";
import { createFilterStore } from "/filters/filter-store.js";
import { createFilterHeader } from "/components/filter-header.js";
import { createFilterOptions } from "/helpers/filter-options.js";
import * as api from "/api/info-loader.js";
import { loadTaxonNameMap } from "/api/taxon-converter.js";
const select=document.querySelector("#preview-case"),card=document.querySelector("#preview-card"),status=document.querySelector("#preview-status");
const width=document.querySelector("#preview-width"),height=document.querySelector("#preview-height");
let view,shared,local,disposed=false,request=0;
const store=createFilterStore();
store.setShared({stateCode:"US-MA",countyCode:"US-MA-017",taxonId:"avibase-4E74AE22"});
store.setChart("t4",{candidateLocationIds:["L1039531","L1055329","L1055336","L109121","L1121533"],selectedCombinationIds:["L1039531","L1055329","L1055336"]});
for(const item of compactCases){const option=document.createElement("option");option.value=item.id;option.textContent=item.label;select.append(option);}
function resize(){card.style.width=Number(width.value)+"px";card.style.height=Number(height.value)+"px";}
async function initialize(){
 try{
  const [geography,taxa,topology]=await Promise.all([api.loadGeographicOptions(),loadTaxonNameMap(),d3.json("/data/counties-10m.json")]);
  const data={...api,loadCountyGeometry:async()=>topology};
  async function show(){
   const token=++request;local?.destroy();shared?.destroy();view?.destroy();
   const item=compactCases.find(item=>item.id===select.value);width.value=item.width;height.value=item.height;resize();
   shared=createFilterHeader({container:"#preview-filters",store,chartId:item.chartId,scope:"shared",options:createFilterOptions(geography,taxa)});
   status.textContent="Loading "+item.label+"…";
   view=item.mount({container:card,store,data,geography,taxa,d3,topojson,presentation:"compact"});
   local=createFilterHeader({container:view.controls,store,chartId:item.chartId,scope:"chart"});
   await view.ready;if(disposed||token!==request)return;
   status.textContent="Ready: "+item.label+" · "+card.clientWidth+" × "+card.clientHeight+" px. No combined dashboard is implemented.";
  }
  select.addEventListener("change",show);document.querySelector("#preview-resize").addEventListener("click",resize);await show();
 }catch(error){status.textContent="Preview failed: "+error.message;}
}
initialize();
window.addEventListener("pagehide",()=>{disposed=true;request++;local?.destroy();shared?.destroy();view?.destroy();});
