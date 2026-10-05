import {open, type QuickSQLiteConnection} from 'react-native-quick-sqlite';
import {AppError} from '@shared/errors/AppError';
import {logger} from '@shared/logging/logger';
import {DB_NAME, DB_VERSION, SCHEMA_STATEMENTS} from './schema';

export interface DatabaseClient {
  execute(
    sql: string,
    params?: (string | number | null)[],
  ): {
    rows: {
      length: number;
      item: (i: number) => Record<string, unknown>;
      _array: Record<string, unknown>[];
    };
  };
  executeAsync(
    sql: string,
    params?: (string | number | null)[],
  ): Promise<{
    rows: {
      length: number;
      item: (i: number) => Record<string, unknown>;
      _array: Record<string, unknown>[];
    };
  }>;
  close(): void;
}

let singleton: DatabaseClient | null = null;

function wrapConnection(db: QuickSQLiteConnection): DatabaseClient {
  return {
    execute(sql, params = []) {
      try {
        const result = db.execute(sql, params);
        const array = (result.rows?._array ?? []) as Record<string, unknown>[];
        return {
          rows: {
            length: array.length,
            _array: array,
            item: (i: number) => array[i] ?? {},
          },
        };
      } catch (error) {
        if (String(error).toLowerCase().includes('full')) {
          throw new AppError(
            'STORAGE_FULL',
            'SQLite storage full',
            'Device storage is full. Free space or export and delete old sessions.',
            false,
          );
        }
        throw error;
      }
    },
    async executeAsync(sql, params = []) {
      try {
        const result = await db.executeAsync(sql, params);
        const array = (result.rows?._array ?? []) as Record<string, unknown>[];
        return {
          rows: {
            length: array.length,
            _array: array,
            item: (i: number) => array[i] ?? {},
          },
        };
      } catch (error) {
        if (String(error).toLowerCase().includes('full')) {
          throw new AppError(
            'STORAGE_FULL',
            'SQLite storage full',
            'Device storage is full. Free space or export and delete old sessions.',
            false,
          );
        }
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
}

export function getDatabase(): DatabaseClient {
  if (singleton) {
    return singleton;
  }
  const db = open({name: DB_NAME});
  const client = wrapConnection(db);
  try {
    migrate(client);
  } catch (error) {
    logger.error('Database initialization failed', error);
    try {
      client.close();
    } catch (closeError) {
      logger.error('Failed to close database after initialization failure', closeError);
    }
    throw error;
  }
  singleton = client;
  return singleton;
}

export function resetDatabaseForTests(client: DatabaseClient | null): void {
  singleton = client;
}

function migrate(db: DatabaseClient): void {
  // Quick SQLite execute prepares only the first statement in a SQL string.
  for (const statement of SCHEMA_STATEMENTS) {
    db.execute(statement);
  }
  const versionRow = db.execute('SELECT value FROM meta WHERE key = ?', ['schema_version']);
  const current = Number(versionRow.rows.item(0)?.value ?? 0);
  if (current < DB_VERSION) {
    db.execute('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)', [
      'schema_version',
      String(DB_VERSION),
    ]);
    logger.info('Database migrated', {version: DB_VERSION});
  }
}
