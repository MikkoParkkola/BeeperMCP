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

export interface SearchFilters {
  from?: Date;
  to?: Date;
  rooms?: string[];
  participants?: string[];
  lang?: string;
  types?: ('text' | 'audio' | 'image' | 'video')[];
}

export interface SearchHit {
  event_id: string;
  ts_utc: string;
  score: number;
}

export async function searchHybrid(
  query: string,
  filters: SearchFilters,
  limit = 50,
): Promise<SearchHit[]> {
  // Minimal stub: BM25 via ts_rank only
  const p = getPool();
  const parts: string[] = ['tsv @@ plainto_tsquery($1)'];
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

  // NEW: participants filter (by sender)
  if (filters.participants?.length) {
    parts.push(`sender = ANY($${arg++})`);
    args.push(filters.participants);
  }

  if (filters.lang) {
    parts.push(`lang = $${arg++}`);
    args.push(filters.lang);
  }

  // NEW: types filter
  if (filters.types?.length) {
    const nonText = filters.types.filter((t) => t !== 'text');
    if (nonText.length && filters.types.includes('text')) {
      parts.push(
        `( (media_types && $${arg}) OR (media_types IS NULL OR array_length(media_types, 1) = 0) )`,
      );
      args.push(nonText);
      arg += 1;
    } else if (nonText.length) {
      parts.push(`media_types && $${arg++}`);
      args.push(nonText);
    } else {
      parts.push(`media_types IS NULL OR array_length(media_types, 1) = 0`);
    }
  }

  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
  const sql = `
    SELECT event_id, ts_utc, ts_rank(tsv, plainto_tsquery($1)) AS score
    FROM messages
    ${where}
    ORDER BY score DESC, ts_utc DESC
    LIMIT ${limit}
  `;
  const res = await p.query(sql, args);
  return res.rows as SearchHit[];
}
