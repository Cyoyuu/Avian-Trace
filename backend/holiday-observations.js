import registerHolidayRoutes from "./holiday-route.cjs";
import { HOLIDAY_OBSERVATIONS_SQL, validateHolidayObservations } from "./holiday-observations-query.js";

/** Reuse the legacy route's read-only database attachments and actual holiday calendar. */
export async function getHolidayObservations(countyCode, taxonId, startYear, endYear) {
  validateHolidayObservations(countyCode, startYear, endYear);
  const connection = await registerHolidayRoutes.getHolidayConnection();
  const start = performance.now();
  const result = await connection.runAndReadAll(HOLIDAY_OBSERVATIONS_SQL, [countyCode, taxonId, startYear, endYear]);
  return { data: result.getRowObjectsJson(), queryTimeMs: Number((performance.now()-start).toFixed(2)) };
}
