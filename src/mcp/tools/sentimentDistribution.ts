import { Pool } from "pg";
import { config } from "../../config.js";
import { JSONSchema7 } from "json-schema";
import { toolsSchemas } from "../schemas/tools.js";

let pool: Pool | null = null;
function getPool() {
  if (!pool) pool = new Pool({ connectionString: config.db.url, ssl: config.db.ssl as any, max: config.db.pool.max });
  return pool;
}

export const id = "sentiment_distribution";
export const inputSchema = toolsSchemas.sentiment_distribution as JSONSchema7;

export async function handler(input: any) {
  const p = getPool();
  const bins = Math.min(Math.max(input.bins ?? 20, 5), 200);
  const step = 2 / bins;
  const edges = Array.from({ length: bins + 1 }, (_, i) => -1 + i * step);
  const sql = `
    SELECT sentiment_score FROM messages
    WHERE sentiment_score IS NOT NULL
    ${input.from ? "AND ts_utc >= $1" : ""} ${input.to ? "AND ts_utc <= $2" : ""}
  `;
  const args: any[] = [];
  if (input.from) args.push(new Date(input.from).toISOString());
  if (input.to) args.push(new Date(input.to).toISOString());
  const rows = (await p.query(sql, args)).rows as { sentiment_score: number }[];
  const counts = Array(bins).fill(0);
  for (const r of rows) {
    const idx = Math.min(Math.floor(((r.sentiment_score + 1) / 2) * bins), bins - 1);
    counts[idx]++;
  }
  const mean = rows.reduce((a, b) => a + b.sentiment_score, 0) / (rows.length || 1);
  return { edges, counts, summary: { count: rows.length, mean } };
}
