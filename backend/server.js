import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getRegionSummary,
  getSpeciesTrend,
  getRichnessRanking,
  getTopSpecies
} from "./queries.js";

import registerHolidayRoutes from "./holiday-route.cjs";

const app = express();
const __dirname = path.dirname(
  fileURLToPath(import.meta.url)
);

const frontendPath = path.resolve(
  __dirname,
  "../frontend"
);

app.use(express.static(frontendPath));
const PORT = 3000;

// Local development only
const HOST = "127.0.0.1";

function parseFilters(req) {
  const regionLevel = String(req.query.regionLevel ?? "state");
  const stateCode = String(req.query.stateCode ?? "US-MA");
  const startYear = Number(req.query.startYear ?? 2012);
  const endYear = Number(req.query.endYear ?? 2025);
  const limit = Number(req.query.limit ?? 10);
  const sortOrder = String(req.query.sortOrder ?? "desc");

  if (!["state", "county"].includes(regionLevel)) {
    throw new Error("Invalid region level");
  }

  if (regionLevel === "county" && !/^US-[A-Z]{2}$/.test(stateCode)) {
    throw new Error("Invalid state code");
  }

  if (
    !Number.isInteger(startYear) ||
    !Number.isInteger(endYear) ||
    startYear < 2012 ||
    endYear > 2026 ||
    startYear > endYear
  ) {
    throw new Error("Invalid year range");
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Limit must be between 1 and 100");
  }

  if (!["asc", "desc"].includes(sortOrder)) {
    throw new Error("Invalid sort order");
  }

  return { regionLevel, stateCode, startYear, endYear, limit, sortOrder };
}

function endpoint(handler) {
  return async (req, res) => {
    try {
      const filters = parseFilters(req);
      const result = await handler(req, filters);
      res.json(result);
    } catch (error) {
      if (error.message.startsWith("Invalid") ||
          error.message.startsWith("Limit") ||
          error.message.startsWith("Missing")) {
        return res.status(400).json({ error: error.message });
      }

      console.error(error);
      res.status(500).json({ error: "Database query failed" });
    }
  };
}

// Test the server without querying DuckDB
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "eBird API"
  });
}); 

app.get("/api/region-summary", endpoint(
  (req, f) => getRegionSummary(
    f.regionCode, f.regionLevel, f.startYear, f.endYear
  )
));

app.get("/api/species-trend", endpoint(
  (req, f) => {
    const taxonId = String(req.query.taxon_id ?? "");

    if (!/^avibase-[A-Za-z0-9-]+$/.test(taxonId)) {
      throw new Error("Missing or invalid taxon_id");
    }

    return getSpeciesTrend(
      f.regionCode, f.regionLevel, taxonId, f.startYear, f.endYear
    );
  }
));

app.get("/api/richness-ranking", endpoint(
  (req, f) => getRichnessRanking(
    f.regionLevel,
    f.regionLevel === "county" ? f.stateCode : null,
    f.startYear,
    f.endYear,
    f.limit,
    f.sortOrder
  )
));

app.get("/api/top-species", endpoint(
  (req, f) => getTopSpecies(
    f.regionCode, f.regionLevel, f.startYear, f.endYear, f.limit
  )
));

registerHolidayRoutes(app);

app.listen(PORT, HOST, () => {
  console.log(`eBird API running at http://${HOST}:${PORT}`);
});
