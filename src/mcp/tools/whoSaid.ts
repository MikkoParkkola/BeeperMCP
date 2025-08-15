import { Pool } from "pg";
import { config } from "../../config.js";
import { toolsSchemas } from "../schemas/tools.js";
import { JSONSchema7 } from "json-schema";

let pool: Pool | null = null;
export function __setTestPool(p: any) {
  // test helper to inject a fake pool
  pool = p as any;
}
function getPool() {
  if (!pool) pool = new Pool({ connectionString: config.db.url, ssl: config.db.ssl as any, max: config.db.pool.max });
  return pool!;
}

export const id = "who_said";
export const inputSchema = toolsSchemas.who_said as JSONSchema7;

export async function handler(input: any) {
  const p = getPool();
  const where: string[] = [];
  const args: any[] = [];
  let i = 1;
  if (input.rooms?.length) {
    where.push(`room_id = ANY($${i++})`);
    args.push(input.rooms);
  }
  if (input.participants?.length) {
    where.push(`sender = ANY($${i++})`);
    args.push(input.participants);
  }
  if (input.lang) {
    where.push(`lang = $${i++}`);
    args.push(input.lang);
  }
  if (input.from) {
    where.push(`ts_utc >= $${i++}`);
    args.push(new Date(input.from).toISOString());
  }
  if (input.to) {
    where.push(`ts_utc <= $${i++}`);
    args.push(new Date(input.to).toISOString());
  }
  const cond = where.length ? "WHERE " + where.join(" AND ") : "";
  const sql = `
    SELECT event_id, room_id, sender, ts_utc, text
    FROM messages
    ${cond}
    ORDER BY ts_utc ASC
    LIMIT 1000
  `;
  const rows = (await p.query(sql, args)).rows as any[];
  // Guard regex usage
  let useRegex = Boolean(input.isRegex);
  let regex: RegExp | null = null;
  const text = String(input.pattern ?? "");
  if (useRegex) {
    if (text.length > 200) useRegex = false;
    try {
      regex = new RegExp(text, "i");
    } catch {
      useRegex = false;
    }
  }
  const results = rows.filter((r) => {
    const t = r.text ?? "";
    return useRegex ? regex!.test(t) : t === text;
  });
  return { hits: results.slice(0, 200) };
}
