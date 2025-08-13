import { Pool } from "pg";
import { config } from "../../config.js";
import { JSONSchema7 } from "json-schema";
import { toolsSchemas } from "../schemas/tools.js";

let pool: Pool | null = null;
function getPool() {
  if (!pool) pool = new Pool({ connectionString: config.db.url, ssl: config.db.ssl as any, max: config.db.pool.max });
  return pool;
}

export const id = "sentiment_trends";
export const inputSchema = toolsSchemas.sentiment_trends as JSONSchema7;

export async function handler(input: any) {
  const p = getPool();
  const where: string[] = ["sentiment_score IS NOT NULL"];
  const args: any[] = [];
  let i = 1;
  if (input.from) {
    where.push(`ts_utc >= $${i++}`);
    args.push(new Date(input.from).toISOString());
  }
  if (input.to) {
    where.push(`ts_utc <= $${i++}`);
    args.push(new Date(input.to).toISOString());
  }
  const bucket = input.bucket ?? "day";
  const bucketKey =
    bucket === "day"
      ? "tz_day::text"
      : bucket === "week"
      ? "tz_year||'-W'||lpad(tz_week::text,2,'0')"
      : bucket === "month"
      ? "tz_month::text"
      : "tz_year::text";
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
           AVG(sentiment_subjectivity) AS subjectivity_mean
    FROM messages
    WHERE ${where.join(" AND ")}
    GROUP BY bucket_key
    ORDER BY MIN(ts_utc)
  `;
  const res = await p.query(sql, args);
  // No smoothing / change point detection in stub
  return {
    filters: { ...input },
    bucket_def: { kind: bucket, tz: "local", disambiguation: "prefer_earlier_offset", k_min: 5 },
    buckets: res.rows
  };
}
