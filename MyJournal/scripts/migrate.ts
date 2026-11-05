import { Pool } from '@neondatabase/serverless';
import { getMigrations } from 'better-auth/db/migration';
import { readFile, writeFile } from 'node:fs/promises';
import { createAuth } from '../api/src/auth.ts';
import type { Env } from '../api/src/env.ts';

process.loadEnvFile('.env');
const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED, connectionTimeoutMillis: 15_000 });
try {
  if (!process.env.DATABASE_URL_UNPOOLED || new URL(process.env.DATABASE_URL_UNPOOLED).hostname.includes('-pooler')) throw new Error('A direct migration connection is required');
  const env = process.env as unknown as Env;
  const auth = createAuth(env, pool, () => { throw new Error('Email cannot be sent during migrations'); });
  const plan = await getMigrations(auth.options);
  if (plan.unsafeChanges.length || plan.schemaProblems.length) throw new Error('Existing auth schema needs manual compatibility review');
  const sql = await plan.compileMigrations();
  if (sql.trim()) {
    await writeFile('api/migrations/000-auth.sql', sql + '\n');
    if (!process.argv.includes('--apply')) { console.log('Auth migration generated; use --apply to apply the reviewed additive schema.'); process.exitCode = 0; }
  }
  if (process.argv.includes('--apply')) {
    await plan.runMigrations();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(await readFile('api/migrations/001-journal.sql', 'utf8'));
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    console.log('Auth and journal migrations applied successfully.');
  }
} catch (error) {
  console.error('Migration failed:', error instanceof Error ? error.name : 'unknown error');
  process.exitCode = 1;
} finally { await pool.end(); }
