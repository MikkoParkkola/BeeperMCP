'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.getEffectiveTz = getEffectiveTz;
exports.toLocalKeys = toLocalKeys;
exports.resolveNaturalRange = resolveNaturalRange;
exports.updateTzTimeline = updateTzTimeline;
const luxon_1 = require('luxon');
const pg_1 = require('pg');
const config_js_1 = require('../config.js');
let pool = null;
function getPool() {
  if (!pool)
    pool = new pg_1.Pool({
      connectionString: config_js_1.config.db.url,
      ssl: config_js_1.config.db.ssl,
      max: config_js_1.config.db.pool.max,
    });
  return pool;
}
async function getEffectiveTz(instant) {
  const p = getPool();
  const res = await p.query(
    'SELECT tz FROM tz_timeline WHERE since <= $1 ORDER BY since DESC LIMIT 1',
    [instant.toISOString()],
  );
  return res.rows[0]?.tz ?? config_js_1.config.timezone.defaultTz;
}
function toLocalKeys(instant, tz) {
  // Disambiguation: for DST gaps, shift forward; for folds, earlier offset
  let dt = luxon_1.DateTime.fromJSDate(instant, { zone: 'utc' }).setZone(tz, {
    keepLocalTime: false,
  });
  if (!dt.isValid && dt.invalidReason === 'unsupported zone') {
    dt = luxon_1.DateTime.fromJSDate(instant, { zone: 'utc' }).setZone(
      config_js_1.config.timezone.defaultTz,
    );
  }
  // Luxon handles gaps/folds deterministically; ensure earlier offset in fold by using setZone with keepLocalTime true then minus 1 ms
  if (!dt.isValid) {
    dt = luxon_1.DateTime.fromJSDate(instant).setZone(tz, {
      keepLocalTime: true,
    });
    if (!dt.isValid) {
      dt = luxon_1.DateTime.fromJSDate(instant).setZone(
        config_js_1.config.timezone.defaultTz,
      );
    }
  }
  const isoWeek = Number(dt.toFormat('W'));
  const year = dt.weekYear;
  const monthKey = Number(dt.toFormat('yyyyLL'));
  return {
    tz_day: dt.toISODate(), // YYYY-MM-DD
    tz_week: isoWeek,
    tz_month: monthKey,
    tz_year: year,
    tz_hour: dt.hour,
    tz_dow: dt.weekday, // 1..7 ISO weekday
  };
}
function resolveNaturalRange(natural, clientTz) {
  const now = luxon_1.DateTime.now().setZone(clientTz);
  let from = now,
    to = now;
  switch (natural) {
    case 'last_7_days':
      from = now.minus({ days: 7 }).startOf('day');
      to = now.endOf('day');
      break;
    case 'last_30_days':
      from = now.minus({ days: 30 }).startOf('day');
      to = now.endOf('day');
      break;
    case 'this_week':
      from = now.startOf('week');
      to = now.endOf('week');
      break;
    case 'this_month':
      from = now.startOf('month');
      to = now.endOf('month');
      break;
    default:
      from = now.minus({ days: 1 }).startOf('day');
      to = now.endOf('day');
  }
  return {
    fromUtc: from.setZone('utc').toJSDate(),
    toUtc: to.setZone('utc').toJSDate(),
  };
}
async function updateTzTimeline(tz, since) {
  const p = getPool();
  await p.query(
    'INSERT INTO tz_timeline (since, tz) VALUES ($1, $2) ON CONFLICT (since) DO UPDATE SET tz = EXCLUDED.tz',
    [since.toISOString(), tz],
  );
}
