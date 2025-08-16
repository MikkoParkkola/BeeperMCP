import { Pool } from 'pg';
import { config } from '../../config.js';
import { JSONSchema7 } from 'json-schema';
import { toolsSchemas } from '../schemas/tools.js';
import { applyCommonFilters } from './filters.js';

let pool: Pool | null = null;
export function __setTestPool(p: any) {
  pool = p as any;
}
function getPool() {
  if (!pool)
    pool = new Pool({
      connectionString: config.db.url,
      ssl: config.db.ssl as any,
      max: config.db.pool.max,
    });
  return pool!;
}

export const id = 'sentiment_trends';
export const inputSchema = toolsSchemas.sentiment_trends as JSONSchema7;

export async function handler(input: any, owner = 'local') {
  const p = getPool();
  const client = await (p as any).connect();
  await client.query('SET app.user = $1', [owner]);
  const where: string[] = ['sentiment_score IS NOT NULL'];
  const args: any[] = [];
  let i = 1;
  if (input.target?.room) {
    where.push(`room_id = $${i++}`);
    args.push(input.target.room);
  }
  if (input.target?.participant) {
    where.push(`sender = $${i++}`);
    args.push(input.target.participant);
  }
  i = applyCommonFilters(where, args, i, {
    from: input.from,
    to: input.to,
    lang: input.lang,
    types: input.types,
  } as any);
  const bucket = input.bucket ?? 'day';
  const bucketKey =
    bucket === 'day'
      ? 'tz_day::text'
      : bucket === 'week'
        ? "tz_year||'-W'||lpad(tz_week::text,2,'0')"
        : bucket === 'month'
          ? 'tz_month::text'
          : 'tz_year::text';
  const sql = `
    SELECT ${bucketKey} AS bucket_key,
           COUNT(*) AS count,
           AVG(sentiment_score) AS mean,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sentiment_score) AS median,
           STDDEV_POP(sentiment_score) AS stdev,
           PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY sentiment_score) AS p10,
           PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY sentiment_score) AS p90,
           AVG((sentiment_score > 0.2)::int)::float AS pos_rate,
           AVG((sentiment_score < -0.2)::int)::float AS neg_rate,
           AVG(subjectivity) AS subjectivity_mean
    FROM messages
    WHERE ${where.join(' AND ')}
    GROUP BY bucket_key
    ORDER BY MIN(ts_utc)
  `;
  const res = await client.query(sql, args);
  // No smoothing / change point detection in stub
  client.release();
  return {
    filters: { ...input },
    bucket_def: {
      kind: bucket,
      tz: 'local',
      disambiguation: 'prefer_earlier_offset',
      k_min: 5,
    },
    buckets: res.rows,
  };
}
