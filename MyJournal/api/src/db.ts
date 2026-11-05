import type { PoolClient } from '@neondatabase/serverless';

export class AccountDeletingError extends Error { constructor() { super('Account deletion is in progress. Retry Delete account to finish.'); this.name = 'AccountDeletingError'; } }

/** Every media/document write shares this owner lock with account deletion. */
export async function lockWritableAccount(client: PoolClient, owner: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [owner]);
  const state = await client.query('SELECT deleting FROM journal_account_state WHERE user_id=$1', [owner]);
  if (state.rows[0]?.deleting) throw new AccountDeletingError();
}
