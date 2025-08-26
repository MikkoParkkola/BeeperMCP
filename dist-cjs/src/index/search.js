'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, '__esModule', { value: true });
exports.searchHybrid = searchHybrid;
exports.__setTestPool = __setTestPool;
const pg_1 = require('pg');
const config_js_1 = require('../config.js');
let pool = null;
function getPool() {
  if (!pool)
    pool = new pg_1.Pool({
      connectionString: config_js_1.config.db.url,
      ssl: config_js_1.config.db.ssl,
      max: config_js_1.config.db.pool.max,
    });
  return pool;
}
async function searchHybrid(query, filters, limit = 50, owner = 'local') {
  const mode = (process.env.SEARCH_MODE || '').toLowerCase();
  const p = getPool();
  const client = await p.connect();
  await client.query('SET app.user = $1', [owner]);
  if (mode === 'vector') {
    // Vector search using pgvector
    const { hashEmbed, embedLiteral } = await Promise.resolve().then(() =>
      __importStar(require('./embed.js')),
    );
    const qvec = hashEmbed(query);
    const lit = embedLiteral(qvec);
    const whereParts = [];
    const args = [];
    let i = 1;
    if (filters.from) {
      whereParts.push(`ts_utc >= $${i++}`);
      args.push(filters.from.toISOString());
    }
    if (filters.to) {
      whereParts.push(`ts_utc <= $${i++}`);
      args.push(filters.to.toISOString());
    }
    if (filters.rooms?.length) {
      whereParts.push(`room_id = ANY($${i++})`);
      args.push(filters.rooms);
    }
    if (filters.participants?.length) {
      whereParts.push(`sender = ANY($${i++})`);
      args.push(filters.participants);
    }
    if (filters.lang) {
      whereParts.push(`lang = $${i++}`);
      args.push(filters.lang);
    }
    const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const sql = `
      SELECT event_id, room_id, sender, substring(text for 200) AS text, ts_utc,
             (embedding <-> $${i}::vector) AS score
      FROM messages
      ${where}
      ORDER BY embedding <-> $${i}::vector ASC
      LIMIT ${limit}
    `;
    const res = await client.query(sql, [...args, lit]);
    client.release();
    return res.rows.map((r) => ({
      ...r,
      uri: `im://matrix/room/${r.room_id}/message/${r.event_id}/context`,
    }));
  }
  // Default: BM25 via ts_rank
  const phrase = /".+"/.test(query);
  const tsFunc = phrase ? 'phraseto_tsquery' : 'plainto_tsquery';
  const parts = [`tsv @@ ${tsFunc}($1)`];
  const args = [query];
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
    SELECT
      event_id,
      room_id,
      sender,
      substring(text for 200) AS text,
      ts_utc,
      ts_rank(tsv, ${tsFunc}($1)) AS score
    FROM messages
    ${where}
    ORDER BY score DESC, ts_utc DESC
    LIMIT ${limit}
  `;
  const res = await client.query(sql, args);
  client.release();
  return res.rows.map((r) => ({
    ...r,
    uri: `im://matrix/room/${r.room_id}/message/${r.event_id}/context`,
  }));
}
function __setTestPool(p) {
  pool = p;
}
