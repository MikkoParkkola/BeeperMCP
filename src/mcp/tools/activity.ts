import { Pool } from "pg";
import { config } from "../../config.js";
import { JSONSchema7 } from "json-schema";
import { toolsSchemas } from "../schemas/tools.js";
import { applyCommonFilters } from "./filters.js";

let pool: Pool | null = null;
export function __setTestPool(p: any) {
  pool = p as any;
}
function getPool() {
  if (!pool) pool = new Pool({ connectionString: config.db.url, ssl: config.db.ssl as any, max: config.db.pool.max });
  return pool!;
}

export const id = "stats_activity";
export const inputSchema = toolsSchemas.stats_activity as JSONSchema7;

export async function handler(input: any) {
  const p = getPool();
  const where: string[] = [];
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
  if (input.target?.room) {
    where.push(`room_id = $${i++}`);
    args.push(input.target.room);
  }
  if (input.target?.participant) {
    where.push(`sender = $${i++}`);
    args.push(input.target.participant);
  }
  i = applyCommonFilters(where, args, i, {
    lang: input.lang,
    types: input.types,
  } as any);
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
           COUNT(*) AS messages,
           COUNT(DISTINCT sender) AS unique_senders,
           COALESCE(SUM(words),0) AS words,
           COALESCE(SUM(attachments),0) AS attachments,
           AVG(CASE WHEN sender = $${i++} THEN 1 ELSE 0 END)::float AS my_share_pct,
           AVG(NULLIF(words,0)) AS avg_len,
           STDDEV_POP(NULLIF(words,0)) AS stdev_len,
           MIN(ts_utc) AS start_utc,
           MAX(ts_utc) AS end_utc
    FROM messages
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    GROUP BY bucket_key
    ORDER BY MIN(ts_utc)
  `;
  const res = await p.query(sql, [...args, config.matrix.userId]);
  return {
    filters: { ...input },
    bucket_def: { kind: bucket, tz: "local", disambiguation: "prefer_earlier_offset", k_min: 5 },
    buckets: res.rows
  };
}
