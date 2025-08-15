import { DateTime } from 'luxon';
import { Pool } from 'pg';
import { config } from '../config/analytics.js';

let pool: Pool | null = null;
function getPool() {
  if (!pool)
    pool = new Pool({
      connectionString: config.db.url,
      ssl: config.db.ssl as any,
      max: config.db.pool.max,
    });
  return pool;
}

export async function getEffectiveTz(instant: Date): Promise<string> {
  const p = getPool();
  const res = await p.query<{ tz: string }>(
    'SELECT tz FROM tz_timeline WHERE since <= $1 ORDER BY since DESC LIMIT 1',
    [instant.toISOString()],
  );
  return res.rows[0]?.tz ?? config.timezone.defaultTz;
}

export function toLocalKeys(
  instant: Date,
  tz: string,
): {
  tz_day: string;
  tz_week: number;
  tz_month: number;
  tz_year: number;
  tz_hour: number;
  tz_dow: number;
} {
  // Disambiguation: for DST gaps, shift forward; for folds, earlier offset
  let dt = DateTime.fromJSDate(instant, { zone: 'utc' }).setZone(tz, {
    keepLocalTime: false,
  });
  if (!dt.isValid && dt.invalidReason === 'unsupported zone') {
    dt = DateTime.fromJSDate(instant, { zone: 'utc' }).setZone(
      config.timezone.defaultTz,
    );
  }
  // Luxon handles gaps/folds deterministically; ensure earlier offset in fold by using setZone with keepLocalTime true then minus 1 ms
  if (!dt.isValid) {
    dt = DateTime.fromJSDate(instant).setZone(tz, { keepLocalTime: true });
    if (!dt.isValid) {
      dt = DateTime.fromJSDate(instant).setZone(config.timezone.defaultTz);
    }
  }
  const isoWeek = Number(dt.toFormat('W'));
  const year = dt.weekYear;
  const monthKey = Number(dt.toFormat('yyyyLL'));
  return {
    tz_day: dt.toISODate()!, // YYYY-MM-DD
    tz_week: isoWeek,
    tz_month: monthKey,
    tz_year: year,
    tz_hour: dt.hour,
    tz_dow: dt.weekday, // 1..7 ISO weekday
  };
}

export function resolveNaturalRange(
  natural: string,
  clientTz: string,
): { fromUtc: Date; toUtc: Date } {
  const now = DateTime.now().setZone(clientTz);
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

export async function updateTzTimeline(tz: string, since: Date): Promise<void> {
  const p = getPool();
  await p.query(
    'INSERT INTO tz_timeline (since, tz) VALUES ($1, $2) ON CONFLICT (since) DO UPDATE SET tz = EXCLUDED.tz',
    [since.toISOString(), tz],
  );
}
