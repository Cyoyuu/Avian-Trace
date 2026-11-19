// Load the mapping of taxon ID to taxon common name
export async function loadTaxonNameMap() {
  const response = await fetch("/api/taxa/names");
  if (!response.ok) throw new Error("Failed to load taxon names");

  const data = await response.json();
  return new Map(
    data.map(d => [d.taxon_id, d.common_name])
  );
}