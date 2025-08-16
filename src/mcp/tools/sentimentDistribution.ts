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

export const id = 'sentiment_distribution';
export const inputSchema = toolsSchemas.sentiment_distribution as JSONSchema7;

export async function handler(input: any, owner = 'local') {
  const p = getPool();
  const client = await (p as any).connect();
  await client.query('SET app.user = $1', [owner]);
  const bins = Math.min(Math.max(input.bins ?? 20, 5), 200);
  const where: string[] = ['sentiment_score IS NOT NULL'];
  const args: any[] = [bins];
  let i = 2;
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
  const sql = `
    WITH data AS (
      SELECT sentiment_score FROM messages WHERE ${where.join(' AND ')}
    )
    SELECT width_bucket(sentiment_score, -1, 1, $1) AS bucket,
           COUNT(*)::int AS count,
           AVG(sentiment_score) AS mean
    FROM data
    GROUP BY bucket
    ORDER BY bucket
  `;
  const res = await client.query(sql, args);
  const counts = Array(bins).fill(0);
  let total = 0;
  let sum = 0;
  for (const r of res.rows as any[]) {
    const idx = Math.max(1, Math.min(bins, r.bucket)) - 1; // 1-based buckets
    counts[idx] = r.count;
    total += r.count;
    sum += (r.mean ?? 0) * r.count;
  }
  const step = 2 / bins;
  const edges = Array.from({ length: bins + 1 }, (_, j) => -1 + j * step);
  const mean = total ? sum / total : 0;
  client.release();
  return { edges, counts, summary: { count: total, mean } };
}
