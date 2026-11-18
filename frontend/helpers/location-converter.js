import { STATE_ABBREVIATIONS } from "./geographic-codes.js";

export function getCountyIdFromRegionCode(regionCode) {
  // Check for region code format
  const match = regionCode.match(/^US-([A-Z]{2})-(\d{3})$/);
  if (!match) return "Invalid region code format";
  const [, abbreviation, countyCode] = match;

  // Retrieve the state id from region code
  const stateId = Object.keys(STATE_ABBREVIATIONS)
    .find(id => STATE_ABBREVIATIONS[id] === abbreviation);
  if (!stateId) return "Error in retrieving state id from region code";

  // Construct and return the county id
  return `${stateId}${countyCode}`;
}

// Filter counties which belongs to the selected state
export function getCountiesByStateId(stateId, allCounties) {
  return {
    type: "FeatureCollection",
    // Each county ID is represented by a 5-digit code. We filter counties by 
    // the first two digits of the code, which correspond to the ID of a state
    features: allCounties.features.filter(d =>
      String(d.id).padStart(5, "0").slice(0, 2) === stateId
    )
  };
}