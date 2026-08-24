import { vi } from 'vitest';

export interface QueryResult<T = unknown> {
  data?: T | null;
  error?: { message: string; code?: string } | null;
  count?: number | null;
}

/**
 * Builds a chainable stand-in for a supabase-js PostgrestFilterBuilder.
 * Every filter/modifier method (`select`, `eq`, `or`, `is`, `order`, ...) returns
 * the same chain so call sites can chain arbitrarily. The chain resolves to
 * `result` whether the caller awaits it directly or terminates with
 * `.single()` / `.maybeSingle()`, matching supabase-js's own thenable builders.
 */
export function createQueryChain<T = unknown>(result: QueryResult<T>) {
  const chain: Record<string, unknown> = {};
  const chainableMethods = [
    'select',
    'insert',
    'update',
    'delete',
    'upsert',
    'eq',
    'neq',
    'gte',
    'lte',
    'or',
    'is',
    'in',
    'order',
    'range',
    'limit',
    'match',
    'contains',
  ];
  for (const method of chainableMethods) {
    chain[method] = vi.fn(() => chain);
  }
  chain.single = vi.fn(() => Promise.resolve(result));
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (
    onfulfilled?: (value: QueryResult<T>) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onfulfilled, onrejected);
  return chain;
}

/**
 * Builds a `{ client: { from } }` stand-in for SupabaseService. `perTable` maps
 * a table name to either a single chain (returned on every `.from(table)` call)
 * or an array of chains consumed in order across successive calls, for tests
 * that hit the same table more than once with different expected results.
 */
export function createSupabaseServiceMock(
  perTable: Record<string, ReturnType<typeof createQueryChain> | ReturnType<typeof createQueryChain>[]>,
) {
  const callCounts: Record<string, number> = {};
  const from = vi.fn((table: string) => {
    const entry = perTable[table];
    if (!entry) {
      throw new Error(`No mock configured for supabase table "${table}"`);
    }
    if (Array.isArray(entry)) {
      const index = callCounts[table] ?? 0;
      callCounts[table] = index + 1;
      const chain = entry[index] ?? entry[entry.length - 1];
      return chain;
    }
    return entry;
  });
  return { client: { from } };
}
