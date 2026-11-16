import { showStateView } from "../us-map.js";

// Add functionalities to the back button
export function setUpBackButton() {
  d3.select("#backButton")
    .on("click", function() {
      // Hide county sidebar
      d3.select(".county-sidebar")
        .style("display", "none");

      // Clear content in county search bar
      d3.select("#county-search")
        .property("value", "");

      // Reset the county count
      d3.select("#county-count")
        .text("");

      // Clear the county list
      d3.select("#county-list")
        .selectAll("*")
        .remove();
      
      // Display the state view of the map
      showStateView();
    });
}