import { DuckDBInstance } from "@duckdb/node-api";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const MAX_CANDIDATES = 10;
const databasePath = fileURLToPath(new URL("../database/ebird_locations.duckdb", import.meta.url));
let pendingConnection;

function invalid(message) { const error = new Error(message); error.status = 400; return error; }
export function validateCounty(countyCode) {
  if (typeof countyCode !== "string" || !/^US-[A-Z]{2}-[0-9]{3}$/.test(countyCode)) throw invalid("Invalid county code");
}
export function validateCandidateIds(ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_CANDIDATES ||
      ids.some(id => typeof id !== "string" || !/^L[0-9]+$/.test(id)) || new Set(ids).size !== ids.length) {
    throw invalid("Invalid candidate locations: choose 1–10 distinct hotspot IDs");
  }
}

export function createLocationQueries(connection) {
  return {
    async search(countyCode, search = "", page = 1) {
      validateCounty(countyCode);
      if (typeof search !== "string" || search.length > 100 || !Number.isSafeInteger(page) || page < 1 || page > 1000000) throw invalid("Invalid location search or page");
      const params = [countyCode, search.trim()];
      const where = "county_code=$1 AND (contains(lower(locality_name),lower($2)) OR contains(lower(locality_id),lower($2)))";
      const total = Number((await connection.runAndReadAll("SELECT COUNT(*) AS total FROM locations WHERE " + where, params)).getRowObjectsJson()[0].total);
      const locations = (await connection.runAndReadAll("SELECT locality_id,locality_name,species_richness FROM locations WHERE " + where + " ORDER BY lower(locality_name),locality_id LIMIT 50 OFFSET $3", [...params, (page - 1) * 50])).getRowObjectsJson();
      return { locations, total, page, pageSize: 50, startYear: 2012, endYear: 2025 };
    },
    async memberships(countyCode, ids) {
      validateCounty(countyCode);
      validateCandidateIds(ids);
      const locations = (await connection.runAndReadAll(`
        SELECT l.locality_id,l.locality_name,LIST(m.taxon_id ORDER BY m.taxon_id) AS species_ids
        FROM locations l JOIN location_species m USING(county_code,locality_id)
        WHERE l.county_code=$1 AND l.locality_id IN (${ids.map((id,index) => "$" + (index+2)).join(",")})
        GROUP BY l.locality_id,l.locality_name ORDER BY l.locality_id
      `, [countyCode, ...ids])).getRowObjectsJson();
      if (locations.length !== ids.length) throw invalid("Invalid candidate: hotspot not present in the selected county summary");
      return locations;
    }
  };
}

async function queries() {
  if (!existsSync(databasePath)) {
    const error = new Error("Hotspot summary unavailable. Run node scripts/build_location_summaries.js before using T4.");
    error.status = 503;
    throw error;
  }
  if (!pendingConnection) pendingConnection = (async () => {
    const instance = await DuckDBInstance.create(databasePath, { access_mode: "READ_ONLY", threads: "4" });
    const connection = await instance.connect();
    try {
      const metadata = (await connection.runAndReadAll("SELECT * FROM build_metadata")).getRowObjectsJson();
      if (metadata.length !== 1 || !metadata[0].complete || metadata[0].version !== 1 || metadata[0].start_year !== 2012 || metadata[0].end_year !== 2025 || metadata[0].locality_type !== "H") throw new Error("Incomplete hotspot summary");
      return { instance, connection, queries: createLocationQueries(connection) };
    } catch (cause) { connection.closeSync(); instance.closeSync(); throw cause; }
  })().catch(cause => { pendingConnection = undefined; const error = new Error("Hotspot summary unavailable or incompatible. Complete the offline preparation.", { cause }); error.status = 503; throw error; });
  return (await pendingConnection).queries;
}

export function registerLocationRoutes(app) {
  function endpoint(handler) {
    return async (req, res) => {
      try { res.json({ data: await handler(req) }); }
      catch (error) {
        if (!error.status) console.error(error);
        res.status(error.status || 500).json({ error: error.status ? error.message : "Location query failed" });
      }
    };
  }
  app.get("/api/hotspots", endpoint(async req => {
    const county = String(req.query.countyCode ?? "");
    validateCounty(county);
    return (await queries()).search(county, String(req.query.search ?? ""), Number(req.query.page ?? 1));
  }));
  app.get("/api/hotspot-species", endpoint(async req => {
    const county = String(req.query.countyCode ?? "");
    const ids = String(req.query.locationIds ?? "").split(",");
    validateCounty(county); validateCandidateIds(ids);
    return (await queries()).memberships(county, ids);
  }));
}
