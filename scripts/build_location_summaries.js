import { DuckDBInstance } from "@duckdb/node-api";
import { readdir, stat, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CREATE_LOCATION_STAGING_SQL, READ_HOTSPOT_FILE_SQL, STAGE_HOTSPOTS_SQL, FINALIZE_LOCATIONS_SQL } from "./location-summary-build.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "database/ebird_locations.duckdb");
const staging = path.join(root, "database/ebird_locations_build.duckdb");
if (existsSync(output)) throw new Error("Location summary already exists. Move it aside explicitly before rebuilding; the server must be stopped before replacing it.");
const source = path.join(root, "parquet/production");
const files = (await readdir(source)).filter(name => /^part_.*\.parquet$/.test(name)).sort();
if (!files.length) throw new Error("No production Parquet files found");
await mkdir(path.join(root, "database/duckdb_temp"), { recursive: true });
const db = await DuckDBInstance.create(staging, { threads: "4", memory_limit: "4GB" });
const connection = await db.connect();
try {
  await connection.run("SET temp_directory='" + path.join(root, "database/duckdb_temp").replaceAll("\\", "/").replaceAll("'", "''") + "'");
  await connection.run("ATTACH '" + path.join(root, "database/ebird.duckdb").replaceAll("\\", "/").replaceAll("'", "''") + "' AS reference_db (READ_ONLY)");
  const finalized = Number((await connection.runAndReadAll("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_name='build_metadata' AND table_catalog=current_database() ")).getRowObjectsJson()[0].n) > 0;
  if (!finalized) await connection.run(CREATE_LOCATION_STAGING_SQL);
  const completed = new Map((await connection.runAndReadAll("SELECT * FROM location_build_files")).getRowObjectsJson().map(row => [row.name, row]));
  const manifest = await Promise.all(files.map(async name => { const info = await stat(path.join(source, name)); return { name, bytes: info.size, modified: String(info.mtimeMs) }; }));
  for (const old of completed.values()) {
    const current = manifest.find(file => file.name === old.name);
    if (!current || current.bytes !== Number(old.bytes) || current.modified !== old.modified) throw new Error("Source changed since staging: " + old.name + ". Start with a new staging database.");
  }
  if (finalized && completed.size !== manifest.length) throw new Error("Source file list changed after finalization");
  for (const [index, file] of manifest.entries()) {
    if (completed.has(file.name)) continue;
    await connection.run("BEGIN TRANSACTION");
    try {
      await connection.run(READ_HOTSPOT_FILE_SQL, [path.join(source, file.name)]);
      await connection.run(STAGE_HOTSPOTS_SQL);
      await connection.run("INSERT INTO location_build_files VALUES ($1,$2,$3)", [file.name,file.bytes,file.modified]);
      await connection.run("COMMIT");
    } catch (error) { await connection.run("ROLLBACK"); throw error; }
    if (index % 20 === 0 || index === files.length - 1) console.log("Prepared " + (index + 1) + "/" + files.length + " files");
  }
  // Recheck the source before publishing the complete snapshot.
  const finalNames = (await readdir(source)).filter(name => /^part_.*\.parquet$/.test(name)).sort();
  if (JSON.stringify(finalNames) !== JSON.stringify(files)) throw new Error("Source file list changed during build");
  for (const file of manifest) {
    const info = await stat(path.join(source, file.name));
    if (info.size !== file.bytes || String(info.mtimeMs) !== file.modified) throw new Error("Source changed during build: " + file.name);
  }
  if (!finalized) {
    await connection.run("BEGIN TRANSACTION");
    try { await connection.run(FINALIZE_LOCATIONS_SQL); await connection.run("COMMIT"); }
    catch (error) { await connection.run("ROLLBACK"); throw error; }
  }
  console.log((await connection.runAndReadAll("SELECT (SELECT COUNT(*) FROM locations) AS hotspots,(SELECT COUNT(*) FROM location_species) AS memberships")).getRowObjectsJson());
  await connection.run("CHECKPOINT");
} finally { connection.closeSync(); db.closeSync(); }
await rename(staging, output);
console.log("Published " + output);
