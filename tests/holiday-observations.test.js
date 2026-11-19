import test from "node:test";
import assert from "node:assert/strict";
import { DuckDBInstance } from "@duckdb/node-api";
import { HOLIDAY_OBSERVATIONS_SQL, validateHolidayObservations } from "../backend/holiday-observations-query.js";
import { buildHolidaySeries } from "../frontend/visualizations/t3/holiday-observations-data.js";
import { createFilterStore } from "../frontend/filters/filter-store.js";
import { getFilterEntries } from "../frontend/filters/filter-definitions.js";

test("holiday records use distinct actual dates and full disjoint calendar denominators", async () => {
  const instance=await DuckDBInstance.create(":memory:");
  const con=await instance.connect();
  try {
    await con.run(`
      ATTACH ':memory:' AS reference_db;
      ATTACH ':memory:' AS daily_db;
      CREATE TABLE reference_db.taxa(taxon_id VARCHAR,category VARCHAR);
      INSERT INTO reference_db.taxa VALUES ('a','species'),('b','species'),('c','issf');
      CREATE TABLE reference_db.counties(county_code VARCHAR);
      INSERT INTO reference_db.counties VALUES ('US-MA-017'),('US-MA-025');
      CREATE TABLE reference_db.summary_completed_years(year INTEGER);
      INSERT INTO reference_db.summary_completed_years VALUES (2012),(2013),(2014),(2016),(2017),(2018),(2019),(2020),(2021);
      CREATE TABLE reference_db.species_region_year(year INTEGER,region_level VARCHAR,region_code VARCHAR,taxon_id VARCHAR,observation_rows BIGINT);
      CREATE TABLE daily_db.species_region_year_avg AS SELECT * FROM reference_db.species_region_year;
      CREATE TABLE daily_db.holidays(date DATE,holiday_name VARCHAR,is_observed BOOLEAN);
      INSERT INTO daily_db.holidays VALUES
        ('2012-01-01','Actual New Year',FALSE),('2012-01-01','Duplicate actual date',FALSE),
        ('2012-01-02','Observed New Year',TRUE),('2012-02-29','Leap day fixture',FALSE),
        ('2013-01-01','New Year',FALSE),('2013-05-27','Different movable date',FALSE),
        ('2015-01-01','New Year',FALSE),('2016-01-01','New Year',FALSE),('2017-01-01','New Year',FALSE),
        ('2018-01-01','New Year',FALSE),('2019-01-01','New Year',FALSE),('2020-01-01','New Year',FALSE),
        ('2021-01-01','New Year',FALSE),('2021-06-19','Additional holiday',FALSE),('2021-12-25','Christmas',FALSE);
      INSERT INTO reference_db.species_region_year
        SELECT year,'county','US-MA-017','a',CASE WHEN year=2020 THEN 0 WHEN year=2021 THEN 300 ELSE 100 END
        FROM range(2012,2022) years(year);
      INSERT INTO daily_db.species_region_year_avg SELECT * FROM reference_db.species_region_year;
      UPDATE daily_db.species_region_year_avg SET observation_rows=NULL WHERE year=2016;
      UPDATE daily_db.species_region_year_avg SET observation_rows=90 WHERE year=2017;
      DELETE FROM daily_db.species_region_year_avg WHERE year=2020;
      INSERT INTO reference_db.species_region_year VALUES (2012,'county','US-MA-025','a',50),(2012,'county','US-MA-017','b',20);
      INSERT INTO daily_db.species_region_year_avg VALUES (2012,'county','US-MA-025','a',50),(2012,'county','US-MA-017','b',20);
      CREATE TABLE daily_db.species_region_holiday(date DATE,region_level VARCHAR,region_code VARCHAR,taxon_id VARCHAR,observation_rows BIGINT);
      INSERT INTO daily_db.species_region_holiday VALUES
        ('2012-01-01','county','US-MA-017','a',7),('2012-02-29','county','US-MA-017','a',3),
        ('2012-01-02','county','US-MA-017','a',20),
        ('2012-01-01','county','US-MA-025','a',4),('2012-01-01','county','US-MA-017','b',2),
        ('2018-01-01','county','US-MA-017','a',101),('2019-01-01','county','US-MA-017','a',NULL),
        ('2021-01-01','county','US-MA-017','a',10),('2021-06-19','county','US-MA-017','a',10),('2021-12-25','county','US-MA-017','a',10);
    `);
    const read=async(county="US-MA-017",taxon="a",start=2012,end=2021)=>(await con.runAndReadAll(HOLIDAY_OBSERVATIONS_SQL,[county,taxon,start,end])).getRowObjectsJson();
    const rows=await read();
    const byYear=new Map(rows.map(row=>[row.year,row]));
    const leap=byYear.get(2012);
    assert.equal(leap.holiday_days,2); // Duplicate calendar entry counts once.
    assert.equal(leap.non_holiday_days,364);
    assert.equal(Number(leap.holiday_observations),10); // Observed-only date is not subtracted.
    assert.equal(Number(leap.non_holiday_observations),90);
    assert.equal(leap.holiday_daily_average,5);
    assert.equal(leap.non_holiday_daily_average,90/364);
    const normal=byYear.get(2013);
    assert.equal(normal.non_holiday_days,363);
    assert.equal(Number(normal.holiday_observations),0);
    assert.equal(normal.non_holiday_daily_average,100/363);
    const changed=byYear.get(2021);
    assert.equal(changed.holiday_days,3);
    assert.equal(changed.non_holiday_days,362);
    assert.equal(changed.holiday_daily_average,10);
    assert.equal(changed.non_holiday_daily_average,270/362);
    for(const year of [2014,2015,2016,2017,2018,2019]){
      assert.equal(byYear.get(year).summary_available,false,year);
      assert.equal(byYear.get(year).holiday_daily_average,null,year);
      assert.equal(byYear.get(year).non_holiday_observations,null,year);
    }
    const zero=byYear.get(2020);
    assert.equal(zero.summary_available,true);
    assert.equal(zero.holiday_daily_average,0);
    assert.equal(zero.non_holiday_daily_average,0);
    assert.equal(zero.holiday_days+zero.non_holiday_days,366);
    assert.equal(Number((await read("US-MA-025","a",2012,2012))[0].holiday_observations),4);
    assert.equal(Number((await read("US-MA-017","b",2012,2012))[0].holiday_observations),2);
    assert.deepEqual(await read("US-MA-017","c"),[]);
    assert.deepEqual(await read("US-ZZ-001"),[]);
  } finally {con.closeSync();instance.closeSync();}
});

test("holiday series preserves zero averages, null gaps, and exact calendar-day calculations",()=>{
  const rows=[{year:2012,summary_available:true,holiday_days:10,non_holiday_days:356,holiday_observations:"0",non_holiday_observations:"1"},
    {year:2014,summary_available:false,unavailable_reason:"Annual summaries disagree"}];
  const original=structuredClone(rows);
  const series=buildHolidaySeries(rows,2012,2014);
  assert.equal(series[0].holidayAverage,0);
  assert.equal(series[0].nonHolidayAverage,1/356);
  assert.equal(series[1].holidayAverage,null);
  assert.equal(series[2].holidayAverage,null);
  assert.equal(series[2].reason,"Annual summaries disagree");
  assert.deepEqual(rows,original);
  assert.throws(()=>buildHolidaySeries([...rows,rows[0]],2012,2014),/duplicate/);
  assert.throws(()=>buildHolidaySeries([{...rows[0],non_holiday_days:355}],2012,2012),/denominators/);
  assert.throws(()=>buildHolidaySeries([{...rows[0],holiday_observations:null}],2012,2012),/Invalid/);
  assert.throws(()=>buildHolidaySeries([],2025,2012),/Invalid/);
  assert.throws(()=>validateHolidayObservations("US-MA",2012,2025),/Invalid/);
  assert.throws(()=>validateHolidayObservations("US-MA-017",2012,2026),/Invalid/);
});

test("T3 standalone uses existing county/species/year filters and ignores other charts' local filters",()=>{
  assert.deepEqual(getFilterEntries({chartId:"t3"}).map(entry=>entry.path),[
    "shared.stateCode","shared.countyCode","shared.taxonId","shared.startYear","shared.endYear"
  ]);
  const store=createFilterStore();const events=[];
  store.subscribe({chartId:"t3"},event=>events.push(event));
  store.setShared({stateCode:"US-MA",countyCode:"US-MA-017",taxonId:"a"});
  store.setChart("t2",{season:"winter"});
  store.setChart("t2Heatmap",{speciesCount:20});
  assert.equal(events.length,1);
  store.setShared({startYear:2020,endYear:2025});
  assert.equal(events.length,2);
  store.setShared({stateCode:"US-NY"});
  assert.equal(events[2].filters.countyCode,null);
});
