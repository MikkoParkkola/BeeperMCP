#!/usr/bin/env ts-node
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { config } from '../src/config.js';

async function main() {
  const dir = path.resolve('migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const pool = new Pool({
    connectionString: config.db.url,
    ssl: config.db.ssl as any,
    max: 1,
  });
  const client = await pool.connect();
  try {
    for (const f of files) {
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      process.stdout.write(`Applying ${f}...\n`);
      await client.query(sql);
    }
    process.stdout.write('Migrations complete.\n');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
