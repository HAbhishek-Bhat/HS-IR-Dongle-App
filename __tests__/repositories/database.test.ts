import {open, type QuickSQLiteConnection} from 'react-native-quick-sqlite';
import {getDatabase, resetDatabaseForTests} from '@data/db/Database';
import {DB_VERSION, SCHEMA_STATEMENTS} from '@data/db/schema';
import {logger} from '@shared/logging/logger';

const openImplementation = jest.mocked(open).getMockImplementation();

describe('database initialization', () => {
  let tables: Set<string>;
  let metadata: Map<string, string>;
  let queue: string[];
  let connection: QuickSQLiteConnection;

  beforeEach(() => {
    resetDatabaseForTests(null);
    tables = new Set();
    metadata = new Map();
    queue = [];
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    if (!openImplementation) {
      throw new Error('Quick SQLite test connection factory is missing');
    }
    jest.mocked(open).mockImplementation(openImplementation);
    connection = open({name: 'test'});
    jest.spyOn(connection, 'execute').mockImplementation((sql, params = []) => {
      // Match the native driver's single-statement execution behavior.
      const statement = sql.split(';')[0].trim();
      const createdTable = /CREATE TABLE IF NOT EXISTS (\w+)/.exec(statement);
      if (createdTable) {
        tables.add(createdTable[1]);
      }
      const queriedTable = /(?:FROM|INTO) (\w+)/.exec(statement)?.[1];
      if (queriedTable && !tables.has(queriedTable)) {
        throw new Error(`no such table: ${queriedTable}`);
      }
      if (statement.startsWith('INSERT') && queriedTable === 'meta') {
        metadata.set(String(params[0]), String(params[1]));
      }
      if (statement.startsWith('INSERT') && queriedTable === 'sync_queue') {
        queue.push(String(params[0]));
      }
      let rows: Record<string, unknown>[] = [];
      if (statement.startsWith('SELECT') && queriedTable === 'meta') {
        const value = metadata.get(String(params[0] ?? 'schema_version'));
        rows = value === undefined ? [] : [{value}];
      } else if (statement.startsWith('SELECT') && queriedTable === 'sync_queue') {
        rows = queue.map(id => ({id}));
      }
      return {
        rowsAffected: 0,
        rows: {length: rows.length, _array: rows, item: i => rows[i]},
      };
    });
    jest.mocked(open).mockReturnValue(connection);
    jest.mocked(open).mockClear();
  });

  afterEach(() => {
    resetDatabaseForTests(null);
    jest.restoreAllMocks();
    jest.mocked(open).mockReset();
  });

  it('creates all tables and indexes before querying schema metadata on a fresh database', () => {
    const db = getDatabase();
    expect(
      db.execute('SELECT value FROM meta WHERE key = ?', ['schema_version']).rows.item(0),
    ).toEqual({value: String(DB_VERSION)});
    for (const table of ['recordings', 'aed_sessions', 'sync_queue']) {
      expect(db.execute(`SELECT * FROM ${table}`).rows.length).toBe(0);
    }
    expect(
      jest
        .mocked(connection.execute)
        .mock.calls.slice(0, SCHEMA_STATEMENTS.length)
        .map(([sql]) => sql),
    ).toEqual(SCHEMA_STATEMENTS);
    expect(SCHEMA_STATEMENTS.filter(sql => sql.startsWith('CREATE INDEX'))).toHaveLength(5);
    expect(getDatabase()).toBe(db);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('repairs a partially initialized database without deleting existing data', () => {
    tables.add('meta');
    metadata.set('retained', 'existing data');
    const db = getDatabase();
    db.execute('INSERT INTO sync_queue VALUES (?, ?, ?, ?, ?, ?, ?)', [
      'q1',
      'recording',
      'r1',
      0,
      '2026-10-05',
      null,
      '2026-10-05',
    ]);
    resetDatabaseForTests(null);
    const reopened = getDatabase();
    expect(
      reopened.execute('SELECT value FROM meta WHERE key = ?', ['retained']).rows.item(0),
    ).toEqual({value: 'existing data'});
    expect(reopened.execute('SELECT id FROM sync_queue').rows.item(0)).toEqual({id: 'q1'});
  });

  it('closes a failed connection, surfaces the error and retries initialization on the next call', () => {
    const failure = new Error('schema creation failed');
    jest.mocked(connection.execute).mockImplementationOnce(() => {
      throw failure;
    });
    jest.mocked(open).mockClear();
    expect(() => getDatabase()).toThrow(failure);
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Database initialization failed', failure);
    expect(getDatabase().execute('SELECT * FROM meta').rows.length).toBe(1);
    expect(open).toHaveBeenCalledTimes(2);
  });
});
