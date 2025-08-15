import { Pool } from "pg";
import { config } from "../../config.js";
import { JSONSchema7 } from "json-schema";
import { toolsSchemas } from "../schemas/tools.js";

let pool: Pool | null = null;
export function __setTestPool(p: any) {
  pool = p as any;
}
function getPool() {
  if (!pool) pool = new Pool({ connectionString: config.db.url, ssl: config.db.ssl as any, max: config.db.pool.max });
  return pool!;
}

export const id = "sentiment_distribution";
export const inputSchema = toolsSchemas.sentiment_distribution as JSONSchema7;

export async function handler(input: any) {
  const p = getPool();
  const bins = Math.min(Math.max(input.bins ?? 20, 5), 200);
  const where: string[] = ["sentiment_score IS NOT NULL"];
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
  if (input.lang) {
    where.push(`lang = $${i++}`);
    args.push(input.lang);
  }
  if (input.types?.length) {
    const nonText = input.types.filter((t: string) => t !== "text");
    if (nonText.length && input.types.includes("text")) {
      where.push(`((media_types && $${i}) OR (media_types IS NULL OR array_length(media_types,1)=0))`);
      args.push(nonText);
      i += 1;
    } else if (nonText.length) {
      where.push(`media_types && $${i++}`);
      args.push(nonText);
    } else {
      where.push(`media_types IS NULL OR array_length(media_types,1)=0`);
    }
  }
  if (input.from) {
    where.push(`ts_utc >= $${i++}`);
    args.push(new Date(input.from).toISOString());
  }
  if (input.to) {
    where.push(`ts_utc <= $${i++}`);
    args.push(new Date(input.to).toISOString());
  }
  const sql = `
    WITH data AS (
      SELECT sentiment_score FROM messages WHERE ${where.join(" AND ")}
    )
    SELECT width_bucket(sentiment_score, -1, 1, $1) AS bucket,
           COUNT(*)::int AS count,
           AVG(sentiment_score) AS mean
    FROM data
    GROUP BY bucket
    ORDER BY bucket
  `;
  const res = await p.query(sql, args);
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
  return { edges, counts, summary: { count: total, mean } };
}
