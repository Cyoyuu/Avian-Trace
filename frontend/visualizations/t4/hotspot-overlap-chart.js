function labelLines(name) {
  return [name.slice(0,36), name.length > 36 ? name.slice(36,69) + (name.length > 69 ? "…" : "") : ""];
}

/** Conventional exclusive UpSet columns: bars above connected membership dots. */
export function createHotspotOverlapChart({ d3 = globalThis.d3, sizing = {}, container, tooltip, onSelect }) {
  const root = d3.select(container).append("div").attr("class", "upset-chart");
  const labels = root.append("svg").attr("class", "upset-chart__labels").attr("aria-hidden", "true");
  const viewport = root.append("div").attr("class", "upset-chart__viewport").attr("tabindex",0)
    .attr("role","region").attr("aria-label","Intersection bars and membership matrix. Scroll horizontally to explore every intersection.");
  const svg = viewport.append("svg").attr("role","group").attr("aria-label","Exclusive species intersections. Enter or Space selects a column; arrow keys move between columns.");
  let current;
  const hideTooltip = () => { tooltip.hidden = true; };
  function showTooltip(event, row) {
    const title = document.createElement("strong");
    title.textContent = row.count + " species in this exclusive intersection";
    const description = document.createElement("div");
    description.textContent = "Recorded at every hotspot below, and absent from the other selected hotspots:";
    const names = current.model.locations.filter(location => row.locationIds.includes(location.id)).map(location => {
      const item = document.createElement("div"); item.textContent = location.name + " [" + location.id + "]"; return item;
    });
    tooltip.replaceChildren(title,description,...names); tooltip.hidden = false;
    const bounds = event.currentTarget.getBoundingClientRect();
    const left = event.type.startsWith("pointer") ? event.clientX+12 : bounds.left;
    const top = event.type.startsWith("pointer") ? event.clientY+12 : bounds.top;
    tooltip.style.left = Math.max(8,Math.min(left,document.documentElement.clientWidth-tooltip.offsetWidth-8))+"px";
    tooltip.style.top = Math.max(8,Math.min(top,document.documentElement.clientHeight-tooltip.offsetHeight-8))+"px";
  }
  function render(next) {
    const focusedMask = container.contains(document.activeElement) ? document.activeElement.getAttribute("data-mask") : null;
    current = next; hideTooltip();
    const { model, selectedMask } = next;
    const { locations, intersections } = model;
    const baseline = sizing.plotHeight ?? 285, firstRow = baseline + 75, rowHeight = sizing.rowHeight ?? 64;
    const height = firstRow + locations.length*rowHeight;
    const width = Math.max(360,viewport.node().clientWidth,intersections.length*52+24);
    svg.attr("width",width).attr("height",height);
    labels.attr("width",280).attr("height",height);
    labels.selectAll("*").remove(); svg.selectAll("*").remove();
    const x = d3.scaleBand().domain(intersections.map(row=>row.mask)).range([12,width-12]).padding(0.26);
    const maximum = Math.max(1,...intersections.map(row=>row.count));
    const y = d3.scaleLinear().domain([0,maximum]).nice().range([baseline,30]);
    labels.append("g").attr("transform","translate(272,0)").call(d3.axisLeft(y).ticks(Math.min(6,y.domain()[1])).tickFormat(d3.format("d")));
    labels.append("text").attr("transform","rotate(-90)").attr("x",-155).attr("y",30).attr("text-anchor","middle").text("Species in exclusive intersection");
    labels.append("text").attr("x",8).attr("y",firstRow-48).attr("class","upset-chart__heading").text("Hotspot · total species in set");
    svg.append("g").attr("class","upset-chart__grid").attr("transform","translate(12,0)")
      .call(d3.axisLeft(y).ticks(Math.min(6,y.domain()[1])).tickSize(-(width-24)).tickFormat(""));
    locations.forEach((location,index)=>{
      const rowY = firstRow+index*rowHeight;
      labels.append("title").text(location.name+" ["+location.id+"]");
      const text = labels.append("text").attr("x",8).attr("y",rowY-13);
      labelLines(location.name).forEach((line,lineIndex)=>text.append("tspan").attr("x",8).attr("dy",lineIndex?15:0).text(line));
      text.append("tspan").attr("x",8).attr("dy",17).attr("class","upset-chart__id").text(location.id+" · "+location.richness+" species");
      svg.append("rect").attr("x",0).attr("y",rowY-30).attr("width",width).attr("height",rowHeight).attr("fill",index%2?"#f0f4f7":"#fafcfd");
    });
    const columns = svg.append("g").selectAll("g").data(intersections,row=>row.mask).join("g")
      .attr("class","upset-chart__column").classed("is-selected",row=>row.mask===selectedMask)
      .attr("data-mask",row=>row.mask).attr("transform",row=>"translate("+x(row.mask)+",0)")
      .attr("tabindex",0).attr("role","button").attr("aria-pressed",row=>String(row.mask===selectedMask))
      .attr("aria-describedby",tooltip.id)
      .attr("aria-label",row=>row.count+" species, exclusively at "+locations.filter(location=>row.locationIds.includes(location.id)).map(location=>location.name+" ["+location.id+"]").join("; "))
      .on("pointerenter focus",showTooltip).on("pointermove",showTooltip).on("pointerleave blur",hideTooltip)
      .on("click",(event,row)=>onSelect(row.mask))
      .on("keydown",function(event,row){
        if(event.key==="Escape")hideTooltip();
        if(event.key==="Enter"||event.key===" "){event.preventDefault();onSelect(row.mask);}
        const index=intersections.findIndex(item=>item.mask===row.mask);
        const destination=event.key==="ArrowRight"?Math.min(index+1,intersections.length-1):event.key==="ArrowLeft"?Math.max(index-1,0):event.key==="Home"?0:event.key==="End"?intersections.length-1:null;
        if(destination!==null){event.preventDefault();columns.nodes()[destination]?.focus();}
      });
    columns.append("rect").attr("class","upset-chart__target").attr("x",-4).attr("y",20).attr("width",x.bandwidth()+8).attr("height",height-35);
    columns.append("rect").attr("class","upset-chart__bar").attr("width",x.bandwidth()).attr("y",row=>y(row.count)).attr("height",row=>baseline-y(row.count));
    columns.append("text").attr("class","upset-chart__count").attr("x",x.bandwidth()/2).attr("y",row=>y(row.count)-7).attr("text-anchor","middle").text(row=>row.count);
    columns.each(function(row){
      const group=d3.select(this), center=x.bandwidth()/2;
      const participating=locations.map((location,index)=>row.locationIds.includes(location.id)?index:-1).filter(index=>index>=0);
      group.append("line").attr("class","upset-chart__connection").attr("x1",center).attr("x2",center)
        .attr("y1",firstRow+participating[0]*rowHeight).attr("y2",firstRow+participating.at(-1)*rowHeight);
      group.selectAll("circle").data(locations).join("circle").attr("cx",center).attr("cy",(location,index)=>firstRow+index*rowHeight).attr("r",7)
        .attr("class",location=>row.locationIds.includes(location.id)?"upset-chart__dot is-member":"upset-chart__dot");
    });
    svg.append("text").attr("x",width/2).attr("y",baseline+24).attr("text-anchor","middle").text("Exact hotspot membership patterns (largest intersections first)");
    if(focusedMask)columns.filter(row=>String(row.mask)===focusedMask).node()?.focus();
  }
  const observer=new ResizeObserver(()=>{if(current)render(current);});observer.observe(container);
  return { render, clear(){current=undefined;hideTooltip();svg.selectAll("*").remove();labels.selectAll("*").remove();svg.attr("height",0);labels.attr("height",0);}, destroy(){observer.disconnect();hideTooltip();root.remove();} };
}
