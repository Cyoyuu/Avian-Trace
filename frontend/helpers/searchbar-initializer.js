// Initialize the county-searching mechanism in the sidebar
export function setUpSearch() {
  d3.select("#county-search")
  .on("input", function() {
    // Obtain the user input on the county-search text field
    const userInput = this.value.toLowerCase().trim();

    // Filter and display the counties which contains the user input,
    // and hide those which do not
    d3.select("#county-list")
      .selectAll("li")
      .style("display", d =>
        d.properties.name.toLowerCase().includes(userInput)
          ? null
          : "none"
      );
  });
}