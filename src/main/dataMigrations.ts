import Database from 'better-sqlite3'

export const CURRENT_SCHEMA_VERSION = 4

export interface Migration {
  version: number
  description: string
  up: (db: Database.Database) => void
}

/**
 * Registers custom SQLite scalar functions required across queries and repositories.
 * Idempotently registered on any new or existing database connection.
 */
function registerCustomSqliteFunctions(_db: Database.Database): void {
  void _db
  // Native SQLite collation and functions handle case folding directly
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description:
      'Baseline schema: core tables (daily_goals with effectiveDate, logs, recurring_goals, inbox_goals, settings, purged_records, group_colors, sync_state)',
    up: (db: Database.Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT
        );

        CREATE TABLE IF NOT EXISTS inbox_goals (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          note TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          createdAt TEXT NOT NULL DEFAULT '',
          updatedAt TEXT,
          deletedAt TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_inbox_goals_deletedAt ON inbox_goals(deletedAt);

        CREATE TABLE IF NOT EXISTS recurring_goals (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          targetMinutes REAL,
          frequency TEXT NOT NULL DEFAULT 'daily',
          startsOn TEXT NOT NULL DEFAULT '',
          endsOn TEXT,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'deleted')),
          createdAt TEXT NOT NULL DEFAULT '',
          pausedAt TEXT,
          deletedAt TEXT,
          updatedAt TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_recurring_goals_deletedAt ON recurring_goals(deletedAt);

        CREATE TABLE IF NOT EXISTS daily_goals (
          id TEXT PRIMARY KEY NOT NULL,
          date TEXT NOT NULL DEFAULT '',
          effectiveDate TEXT,
          title TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'in_progress', 'done')),
          targetMinutes REAL,
          deadline TEXT,
          sourceInboxGoalId TEXT REFERENCES inbox_goals(id) ON DELETE SET NULL,
          sourceRecurringGoalId TEXT REFERENCES recurring_goals(id) ON DELETE SET NULL,
          createdAt TEXT NOT NULL DEFAULT '',
          completedAt TEXT,
          carriedFromDate TEXT,
          carriedToDate TEXT,
          carriedFromGoalId TEXT REFERENCES daily_goals(id) ON DELETE SET NULL,
          note TEXT,
          remindAt TEXT,
          repeat TEXT,
          groupTag TEXT COLLATE NOCASE,
          groupColor TEXT,
          sortOrder REAL,
          goalType TEXT DEFAULT 'deep' CHECK(goalType IN ('deep', 'routine') OR goalType IS NULL),
          restoredAt TEXT,
          updatedAt TEXT,
          deletedAt TEXT,
          CHECK(deletedAt IS NULL OR length(deletedAt) > 0)
        );

        CREATE INDEX IF NOT EXISTS idx_daily_goals_date ON daily_goals(date);
        CREATE INDEX IF NOT EXISTS idx_daily_goals_effectiveDate ON daily_goals(effectiveDate);
        CREATE INDEX IF NOT EXISTS idx_daily_goals_sourceRecurringGoalId ON daily_goals(sourceRecurringGoalId);
        CREATE INDEX IF NOT EXISTS idx_daily_goals_updatedAt ON daily_goals(updatedAt);
        CREATE INDEX IF NOT EXISTS idx_daily_goals_deletedAt ON daily_goals(deletedAt);
        CREATE INDEX IF NOT EXISTS idx_daily_goals_groupTag ON daily_goals(groupTag) WHERE deletedAt IS NULL;
        CREATE INDEX IF NOT EXISTS idx_daily_goals_status_deleted ON daily_goals(status, deletedAt);
        CREATE INDEX IF NOT EXISTS idx_daily_goals_board ON daily_goals(deletedAt, status, date);
        CREATE INDEX IF NOT EXISTS idx_daily_goals_heatmap ON daily_goals(status, deletedAt, completedAt, date);
        CREATE INDEX IF NOT EXISTS idx_daily_goals_effective_done ON daily_goals(effectiveDate, status, deletedAt);
        CREATE INDEX IF NOT EXISTS idx_daily_goals_carriedToDate ON daily_goals(carriedToDate);
        CREATE INDEX IF NOT EXISTS idx_daily_goals_carriedFromGoalId ON daily_goals(carriedFromGoalId);
        CREATE INDEX IF NOT EXISTS idx_daily_goals_active_board ON daily_goals(date, sortOrder, createdAt) WHERE deletedAt IS NULL AND status IN ('planned', 'in_progress');
        CREATE INDEX IF NOT EXISTS idx_daily_goals_done_board ON daily_goals(date, completedAt) WHERE deletedAt IS NULL AND status = 'done';

        CREATE TABLE IF NOT EXISTS logs (
          id TEXT PRIMARY KEY NOT NULL,
          timestamp TEXT NOT NULL DEFAULT '',
          text TEXT NOT NULL DEFAULT '',
          startedAt TEXT,
          endedAt TEXT,
          goalId TEXT REFERENCES daily_goals(id) ON DELETE SET NULL,
          goalTitle TEXT,
          note TEXT,
          productivity TEXT CHECK(productivity IN ('productive', 'break') OR productivity IS NULL),
          durationMinutes REAL,
          productiveMinutes REAL,
          date TEXT NOT NULL DEFAULT '',
          focusQuality INTEGER,
          goalType TEXT DEFAULT 'deep' CHECK(goalType IN ('deep', 'routine') OR goalType IS NULL),
          audioMode TEXT CHECK(audioMode IN ('silence', 'focus_sound', 'music') OR audioMode IS NULL),
          didDotReset INTEGER DEFAULT 0,
          updatedAt TEXT,
          deletedAt TEXT,
          CHECK(deletedAt IS NULL OR length(deletedAt) > 0)
        );

        CREATE INDEX IF NOT EXISTS idx_logs_date ON logs(date);
        CREATE INDEX IF NOT EXISTS idx_logs_goalId ON logs(goalId);
        CREATE INDEX IF NOT EXISTS idx_logs_updatedAt ON logs(updatedAt);
        CREATE INDEX IF NOT EXISTS idx_logs_deletedAt ON logs(deletedAt);
        CREATE INDEX IF NOT EXISTS idx_logs_goalId_deleted ON logs(goalId, deletedAt);
        CREATE INDEX IF NOT EXISTS idx_logs_heatmap ON logs(deletedAt, productivity, date) WHERE deletedAt IS NULL;

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT
        );

        CREATE TABLE IF NOT EXISTS group_colors (
          tag TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
          color TEXT NOT NULL,
          updatedAt TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS purged_records (
          id TEXT PRIMARY KEY NOT NULL,
          entity TEXT NOT NULL,
          purgedAt TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_purged_records_entity ON purged_records (entity);
        CREATE INDEX IF NOT EXISTS idx_purged_records_purgedAt ON purged_records (purgedAt);
      `)
    }
  },
  {
    version: 2,
    description: 'Add focusQuality column to logs table for check-in quality self-ratings',
    up: (db: Database.Database) => {
      const colInfo = db.prepare("PRAGMA table_info('logs')").all() as { name: string }[]
      const hasCol = colInfo.some((col) => col.name === 'focusQuality')
      if (!hasCol) {
        db.exec('ALTER TABLE logs ADD COLUMN focusQuality INTEGER;')
      }
    }
  },
  {
    version: 3,
    description:
      'Add learning_tracks table and learningTrackId/learningStage to daily_goals for #learning spaced repetition',
    up: (db: Database.Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS learning_tracks (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          originalGoalId TEXT REFERENCES daily_goals(id) ON DELETE SET NULL,
          originDate TEXT NOT NULL DEFAULT '',
          targetMinutes REAL,
          currentStage INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'mastered', 'paused', 'deleted')),
          day1Date TEXT NOT NULL DEFAULT '',
          day1Status TEXT NOT NULL DEFAULT 'pending' CHECK(day1Status IN ('pending', 'scheduled', 'completed', 'skipped')),
          day1GoalId TEXT REFERENCES daily_goals(id) ON DELETE SET NULL,
          day1CompletedAt TEXT,
          day7Date TEXT NOT NULL DEFAULT '',
          day7Status TEXT NOT NULL DEFAULT 'pending' CHECK(day7Status IN ('pending', 'scheduled', 'completed', 'skipped')),
          day7GoalId TEXT REFERENCES daily_goals(id) ON DELETE SET NULL,
          day7CompletedAt TEXT,
          day30Date TEXT NOT NULL DEFAULT '',
          day30Status TEXT NOT NULL DEFAULT 'pending' CHECK(day30Status IN ('pending', 'scheduled', 'completed', 'skipped')),
          day30GoalId TEXT REFERENCES daily_goals(id) ON DELETE SET NULL,
          day30CompletedAt TEXT,
          note TEXT,
          createdAt TEXT NOT NULL DEFAULT '',
          updatedAt TEXT,
          deletedAt TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_learning_tracks_dates ON learning_tracks(day1Date, day7Date, day30Date);
        CREATE INDEX IF NOT EXISTS idx_learning_tracks_status ON learning_tracks(status, deletedAt);
        CREATE INDEX IF NOT EXISTS idx_learning_tracks_originGoalId ON learning_tracks(originalGoalId);
      `)

      const goalCols = db.prepare("PRAGMA table_info('daily_goals')").all() as { name: string }[]
      const hasTrackId = goalCols.some((col) => col.name === 'learningTrackId')
      if (!hasTrackId) {
        db.exec(
          'ALTER TABLE daily_goals ADD COLUMN learningTrackId TEXT REFERENCES learning_tracks(id) ON DELETE SET NULL;'
        )
      }
      const hasStage = goalCols.some((col) => col.name === 'learningStage')
      if (!hasStage) {
        db.exec(
          'ALTER TABLE daily_goals ADD COLUMN learningStage INTEGER CHECK(learningStage IN (1, 2, 3));'
        )
      }
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_daily_goals_learningTrackId ON daily_goals(learningTrackId);'
      )
    }
  },
  {
    version: 4,
    description: 'Add goalType to daily_goals and goalType, audioMode, didDotReset to logs',
    up: (db: Database.Database): void => {
      const goalCols = db.prepare("PRAGMA table_info('daily_goals')").all() as { name: string }[]
      if (!goalCols.some((col) => col.name === 'goalType')) {
        db.exec(
          "ALTER TABLE daily_goals ADD COLUMN goalType TEXT DEFAULT 'deep' CHECK(goalType IN ('deep', 'routine') OR goalType IS NULL);"
        )
      }

      const logCols = db.prepare("PRAGMA table_info('logs')").all() as { name: string }[]
      if (!logCols.some((col) => col.name === 'goalType')) {
        db.exec(
          "ALTER TABLE logs ADD COLUMN goalType TEXT DEFAULT 'deep' CHECK(goalType IN ('deep', 'routine') OR goalType IS NULL);"
        )
      }
      if (!logCols.some((col) => col.name === 'audioMode')) {
        db.exec(
          "ALTER TABLE logs ADD COLUMN audioMode TEXT CHECK(audioMode IN ('silence', 'focus_sound', 'music') OR audioMode IS NULL);"
        )
      }
      if (!logCols.some((col) => col.name === 'didDotReset')) {
        db.exec('ALTER TABLE logs ADD COLUMN didDotReset INTEGER DEFAULT 0;')
      }
    }
  }
]

/**
 * Gets the current database schema version from SQLite's native PRAGMA user_version.
 */
export function getSchemaVersion(db: Database.Database): number {
  try {
    return (db.pragma('user_version', { simple: true }) as number) ?? 0
  } catch {
    return 0
  }
}

/**
 * Sets the database schema version via SQLite's native PRAGMA user_version.
 */
function setSchemaVersion(db: Database.Database, version: number): void {
  db.pragma(`user_version = ${version}`)
}

/**
 * Executes all pending sequential migrations inside individual atomic transactions.
 */
export function runSchemaMigrations(db: Database.Database): void {
  registerCustomSqliteFunctions(db)

  for (const migration of MIGRATIONS) {
    const currentVersion = getSchemaVersion(db)
    if (migration.version > currentVersion) {
      db.transaction(() => {
        migration.up(db)
        setSchemaVersion(db, migration.version)
      })()
    }
  }
}

/**
 * Initializes the full database schema by running all sequential forward migrations.
 */
export function initDatabaseSchema(db: Database.Database): void {
  runSchemaMigrations(db)
}
