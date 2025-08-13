import { Pool } from "pg";
import { config } from "../config.js";

let pool: Pool | null = null;
function getPool() {
  if (!pool) pool = new Pool({ connectionString: config.db.url, ssl: config.db.ssl as any, max: config.db.pool.max });
  return pool;
}

export interface SearchFilters {
  from?: Date;
  to?: Date;
  rooms?: string[];
  participants?: string[];
  lang?: string;
  types?: ("text" | "audio" | "image" | "video")[];
}

export interface SearchHit {
  event_id: string;
  ts_utc: string;
  score: number;
}

export async function searchHybrid(query: string, filters: SearchFilters, limit = 50): Promise<SearchHit[]> {
  // Minimal stub: BM25 via ts_rank only
  const p = getPool();
  const parts: string[] = ["tsv @@ plainto_tsquery($1)"];
  const args: any[] = [query];
  let arg = 2;
  if (filters.from) {
    parts.push(`ts_utc >= $${arg++}`);
    args.push(filters.from.toISOString());
  }
  if (filters.to) {
    parts.push(`ts_utc <= $${arg++}`);
    args.push(filters.to.toISOString());
  }
  if (filters.rooms?.length) {
    parts.push(`room_id = ANY($${arg++})`);
    args.push(filters.rooms);
  }
  if (filters.lang) {
    parts.push(`lang = $${arg++}`);
    args.push(filters.lang);
  }
  const where = parts.length ? `WHERE ${parts.join(" AND ")}` : "";
  const sql = `
    SELECT event_id, ts_utc, ts_rank(tsv, plainto_tsquery($1)) AS score
    FROM messages
    ${where}
    ORDER BY score DESC
    LIMIT ${limit}
  `;
  const res = await p.query(sql, args);
  return res.rows as SearchHit[];
}
