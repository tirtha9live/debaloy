import { env } from 'cloudflare:workers';
import { CELL_NOTE_MAX } from './format';

export const BACKUP_VERSION = 4;
export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

export type RestoreMode = 'overwrite' | 'merge';

export type LedgerBackup = {
  app: 'debaloy';
  version: number;
  exportedAt: string;
  tables: {
    flats: unknown[];
    maintenance: unknown[];
    puja: unknown[];
    categories: unknown[];
    entries: unknown[];
    settings: unknown[];
    visitors: unknown[];
    login_events: unknown[];
    withdrawals: unknown[];
    ledger_years: unknown[];
    e_receipt_mobiles: unknown[];
    online_payments: unknown[];
    flat_bank_accounts: unknown[];
  };
};

function db() {
  return (env as Cloudflare.Env).DB;
}

export function backupFilename(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `debaloy-ledger-${pick('year')}${pick('month')}${pick('day')}-${pick('hour')}${pick('minute')}.json`;
}

export async function buildLedgerBackup(): Promise<LedgerBackup> {
  const database = db();
  const [
    flats,
    maintenance,
    puja,
    categories,
    entries,
    settings,
    visitors,
    loginEvents,
    withdrawals,
    ledgerYears,
    eReceiptMobiles,
    onlinePayments,
    flatBankAccounts,
  ] = await database.batch([
      database.prepare('SELECT id, resident, sort_order FROM flats ORDER BY sort_order, id'),
      database.prepare(
        'SELECT flat_id, month, amount, mode, npr, note, paid_on FROM maintenance ORDER BY flat_id, month',
      ),
      database.prepare('SELECT flat_id, year_id, amount FROM puja ORDER BY year_id, flat_id'),
      database.prepare(
        'SELECT id, kind, name, sort_order, is_builtin FROM categories ORDER BY kind, sort_order, id',
      ),
      database.prepare(
        'SELECT id, kind, date, category, description, mode, amount, created_at FROM entries ORDER BY id',
      ),
      database.prepare('SELECT key, value FROM settings ORDER BY key'),
      database.prepare(
        'SELECT session_id, role, ip, device, user_agent, fingerprint, first_seen, last_seen, views, downloads FROM visitors ORDER BY last_seen DESC',
      ),
      database.prepare(
        'SELECT id, at, outcome, role, ip, device, user_agent, fingerprint, session_id FROM login_events ORDER BY id',
      ),
      database.prepare('SELECT id, date, amount, note, created_at FROM withdrawals ORDER BY id'),
      database.prepare(
        `SELECT id, label, start_date, end_date, opening_cash, opening_bank,
                cash_in_hand, cash_in_bank, cash_in_hand_override, cash_in_bank_override, created_at
         FROM ledger_years ORDER BY start_date, id`,
      ),
      database.prepare('SELECT flat_id, mobile, updated_at FROM e_receipt_mobiles ORDER BY flat_id'),
      database.prepare(
        `SELECT id, year_id, flat_id, payment_type, description, amount, link_account, status,
                bank, account_holder, applied_month, submitted_at, approved_at
         FROM online_payments ORDER BY id`,
      ),
      database.prepare(
        `SELECT id, flat_id, bank, account_holder, auto_sync, last_used_at
         FROM flat_bank_accounts ORDER BY flat_id, last_used_at DESC, id DESC`,
      ),
    ]);

  return {
    app: 'debaloy',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      flats: flats.results ?? [],
      maintenance: maintenance.results ?? [],
      puja: puja.results ?? [],
      categories: categories.results ?? [],
      entries: entries.results ?? [],
      settings: settings.results ?? [],
      visitors: visitors.results ?? [],
      login_events: loginEvents.results ?? [],
      withdrawals: withdrawals.results ?? [],
      ledger_years: ledgerYears.results ?? [],
      e_receipt_mobiles: eReceiptMobiles.results ?? [],
      online_payments: onlinePayments.results ?? [],
      flat_bank_accounts: flatBankAccounts.results ?? [],
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function asAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function asOptionalAmount(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function asInt(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function asMode(value: unknown) {
  return String(value) === 'Cash' ? 'Cash' : 'Bank';
}

function asKind(value: unknown) {
  return String(value) === 'expense' ? 'expense' : String(value) === 'income' ? 'income' : null;
}

function asDate(value: unknown) {
  const text = asText(value, 32);
  if (!text) return null;
  return text.slice(0, 10);
}

export function parseLedgerBackup(raw: string): LedgerBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const body = asRecord(parsed);
  const tables = asRecord(body?.tables);
  if (!body || body.app !== 'debaloy' || !tables) {
    throw new Error('That file is not a Debaloy ledger backup.');
  }
  return {
    app: 'debaloy',
    version: asInt(body.version) || BACKUP_VERSION,
    exportedAt: asText(body.exportedAt, 40) || new Date().toISOString(),
    tables: {
      flats: asList(tables.flats),
      maintenance: asList(tables.maintenance),
      puja: asList(tables.puja),
      categories: asList(tables.categories),
      entries: asList(tables.entries),
      settings: asList(tables.settings),
      visitors: asList(tables.visitors),
      login_events: asList(tables.login_events),
      withdrawals: asList(tables.withdrawals),
      ledger_years: asList(tables.ledger_years),
      e_receipt_mobiles: asList(tables.e_receipt_mobiles),
      online_payments: asList(tables.online_payments),
      flat_bank_accounts: asList(tables.flat_bank_accounts),
    },
  };
}

async function runChunks(statements: D1PreparedStatement[]) {
  const database = db();
  const size = 1000;
  for (let index = 0; index < statements.length; index += size) {
    const chunk = statements.slice(index, index + size);
    if (chunk.length) await database.batch(chunk);
  }
}

function lastUpdatedStatement() {
  return db()
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('last_updated_at', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(new Date().toISOString());
}

export async function restoreLedgerBackup(backup: LedgerBackup, mode: RestoreMode) {
  const database = db();
  const overwrite = mode === 'overwrite';
  const conflict = overwrite ? '' : ' OR REPLACE';
  const statements: D1PreparedStatement[] = [];

  if (overwrite) {
    statements.push(
      database.prepare('DELETE FROM login_events'),
      database.prepare('DELETE FROM visitors'),
      database.prepare('DELETE FROM withdrawals'),
      database.prepare('DELETE FROM online_payments'),
      database.prepare('DELETE FROM flat_bank_accounts'),
      database.prepare('DELETE FROM e_receipt_mobiles'),
      database.prepare('DELETE FROM entries'),
      database.prepare('DELETE FROM categories'),
      database.prepare('DELETE FROM maintenance'),
      database.prepare('DELETE FROM puja'),
      database.prepare('DELETE FROM ledger_years'),
      database.prepare('DELETE FROM settings'),
      database.prepare('DELETE FROM flats'),
    );
  }

  for (const row of backup.tables.flats) {
    const item = asRecord(row);
    const id = asText(item?.id, 16);
    const resident =
      asText(item?.resident, 80) || asText(item?.owner, 80);
    if (!item || !id || !resident) continue;
    statements.push(
      database
        .prepare(
          `INSERT${conflict} INTO flats (id, resident, sort_order) VALUES (?, ?, ?)`,
        )
        .bind(id, resident, asInt(item.sort_order)),
    );
  }

  const yearRows = backup.tables.ledger_years;
  if (!yearRows.length) {
    statements.push(
      database
        .prepare(
          `INSERT${conflict} INTO ledger_years (
             id, label, start_date, end_date, opening_cash, opening_bank
           ) VALUES (1, 'FY 2026-27', '2026-09-01', NULL, 1364, 229460.9)`,
        ),
    );
  }
  for (const row of yearRows) {
    const item = asRecord(row);
    const startDate = asDate(item?.start_date) || asDate(item?.startDate);
    if (!item || !startDate) continue;
    const id = asInt(item.id) || 1;
    statements.push(
      database
        .prepare(
          `INSERT${conflict} INTO ledger_years (
             id, label, start_date, end_date, opening_cash, opening_bank,
             cash_in_hand, cash_in_bank, cash_in_hand_override, cash_in_bank_override
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          asText(item.label, 40) || 'FY',
          startDate,
          asDate(item.end_date) || asDate(item.endDate),
          asAmount(item.opening_cash ?? item.openingCash),
          asAmount(item.opening_bank ?? item.openingBank),
          asOptionalAmount(item.cash_in_hand ?? item.cashInHand),
          asOptionalAmount(item.cash_in_bank ?? item.cashInBank),
          asInt(item.cash_in_hand_override ?? item.cashInHandOverride) ? 1 : 0,
          asInt(item.cash_in_bank_override ?? item.cashInBankOverride) ? 1 : 0,
        ),
    );
  }

  const legacyZeroIsNpr = asInt(backup.version) < 4;
  for (const row of backup.tables.maintenance) {
    const item = asRecord(row);
    const flatId = asText(item?.flat_id, 16);
    const month = asText(item?.month, 16);
    if (!item || !flatId || !month) continue;
    const amount = asOptionalAmount(item.amount);
    const npr = asInt(item.npr) === 1 || (legacyZeroIsNpr && amount === 0);
    const paid = !npr && amount != null && amount > 0;
    const note = npr || paid ? asText(item.note, CELL_NOTE_MAX) || null : null;
    const paidOn = paid ? asDate(item.paid_on) : null;
    statements.push(
      database
        .prepare(
          `INSERT${conflict} INTO maintenance (flat_id, month, amount, mode, npr, note, paid_on)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(flatId, month, npr ? null : amount, asMode(item.mode), npr ? 1 : 0, note, paidOn),
    );
  }

  for (const row of backup.tables.puja) {
    const item = asRecord(row);
    const flatId = asText(item?.flat_id, 16);
    if (!item || !flatId) continue;
    statements.push(
      database
        .prepare(`INSERT${conflict} INTO puja (flat_id, year_id, amount) VALUES (?, ?, ?)`)
        .bind(flatId, asInt(item.year_id) || 1, asAmount(item.amount)),
    );
  }

  for (const row of backup.tables.categories) {
    const item = asRecord(row);
    const kind = asKind(item?.kind);
    const name = asText(item?.name, 80);
    if (!item || !kind || !name) continue;
    const id = asInt(item.id);
    const isBuiltin = asInt(item.is_builtin) ? 1 : 0;
    const sortOrder = asInt(item.sort_order);
    if (id > 0) {
      statements.push(
        database
          .prepare(
            `INSERT${conflict} INTO categories (id, kind, name, sort_order, is_builtin)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(id, kind, name, sortOrder, isBuiltin),
      );
    } else if (!overwrite) {
      statements.push(
        database
          .prepare(
            `INSERT INTO categories (kind, name, sort_order, is_builtin)
             SELECT ?, ?, ?, ?
             WHERE NOT EXISTS (
               SELECT 1 FROM categories WHERE kind = ? AND lower(trim(name)) = lower(?)
             )`,
          )
          .bind(kind, name, sortOrder, isBuiltin, kind, name),
      );
    }
  }

  for (const row of backup.tables.entries) {
    const item = asRecord(row);
    const kind = asKind(item?.kind);
    const category = asText(item?.category, 80);
    if (!item || !kind || !category) continue;
    const id = asInt(item.id);
    const createdAt = asText(item.created_at, 40) || new Date().toISOString();
    if (id > 0) {
      statements.push(
        database
          .prepare(
            `INSERT${conflict} INTO entries (id, kind, date, category, description, mode, amount, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            kind,
            asDate(item.date),
            category,
            asText(item.description, 240),
            asMode(item.mode),
            asAmount(item.amount),
            createdAt,
          ),
      );
    } else if (!overwrite) {
      statements.push(
        database
          .prepare(
            `INSERT INTO entries (kind, date, category, description, mode, amount, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            kind,
            asDate(item.date),
            category,
            asText(item.description, 240),
            asMode(item.mode),
            asAmount(item.amount),
            createdAt,
          ),
      );
    }
  }

  for (const row of backup.tables.withdrawals) {
    const item = asRecord(row);
    if (!item) continue;
    const amount = asAmount(item.amount);
    if (amount <= 0) continue;
    const id = asInt(item.id);
    const createdAt = asText(item.created_at, 40) || new Date().toISOString();
    if (id > 0) {
      statements.push(
        database
          .prepare(
            `INSERT${conflict} INTO withdrawals (id, date, amount, note, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(id, asDate(item.date), amount, asText(item.note, 240), createdAt),
      );
    } else if (!overwrite) {
      statements.push(
        database
          .prepare('INSERT INTO withdrawals (date, amount, note, created_at) VALUES (?, ?, ?, ?)')
          .bind(asDate(item.date), amount, asText(item.note, 240), createdAt),
      );
    }
  }

  for (const row of backup.tables.settings) {
    const item = asRecord(row);
    const key = asText(item?.key, 64);
    if (!item || !key) continue;
    statements.push(
      database
        .prepare(
          `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .bind(key, asText(item.value, 240)),
    );
  }

  for (const row of backup.tables.visitors) {
    const item = asRecord(row);
    const sessionId = asText(item?.session_id, 80);
    if (!item || !sessionId) continue;
    statements.push(
      database
        .prepare(
          `INSERT${conflict} INTO visitors (
             session_id, role, ip, device, user_agent, fingerprint, first_seen, last_seen, views, downloads
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          sessionId,
          asText(item.role, 32) || 'resident',
          asText(item.ip, 64),
          asText(item.device, 32),
          asText(item.user_agent, 240),
          asText(item.fingerprint, 32),
          asText(item.first_seen, 40) || new Date().toISOString(),
          asText(item.last_seen, 40) || new Date().toISOString(),
          asInt(item.views),
          asInt(item.downloads),
        ),
    );
  }

  for (const row of backup.tables.login_events) {
    const item = asRecord(row);
    if (!item) continue;
    const id = asInt(item.id);
    const at = asText(item.at, 40) || new Date().toISOString();
    const outcome = asText(item.outcome, 32) || 'failed';
    const role = asText(item.role, 32) || null;
    const ip = asText(item.ip, 64);
    const device = asText(item.device, 32);
    const userAgent = asText(item.user_agent, 240);
    const fingerprint = asText(item.fingerprint, 32);
    const sessionId = asText(item.session_id, 80) || null;
    if (id > 0) {
      statements.push(
        database
          .prepare(
            `INSERT${conflict} INTO login_events (
               id, at, outcome, role, ip, device, user_agent, fingerprint, session_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(id, at, outcome, role, ip, device, userAgent, fingerprint, sessionId),
      );
    } else if (!overwrite) {
      statements.push(
        database
          .prepare(
            `INSERT INTO login_events (at, outcome, role, ip, device, user_agent, fingerprint, session_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(at, outcome, role, ip, device, userAgent, fingerprint, sessionId),
      );
    }
  }

  for (const row of backup.tables.e_receipt_mobiles) {
    const item = asRecord(row);
    const flatId = asText(item?.flat_id, 16);
    const mobile = asText(item?.mobile, 16).replace(/\D/g, '');
    if (!item || !flatId || mobile.length !== 10) continue;
    statements.push(
      database
        .prepare(
          `INSERT${conflict} INTO e_receipt_mobiles (flat_id, mobile, updated_at) VALUES (?, ?, ?)`,
        )
        .bind(flatId, mobile, asText(item.updated_at, 40) || new Date().toISOString()),
    );
  }

  for (const row of backup.tables.online_payments) {
    const item = asRecord(row);
    if (!item) continue;
    const flatId = asText(item.flat_id, 16);
    const paymentType = asText(item.payment_type, 16);
    if (!flatId || !['maintenance', 'dues', 'others'].includes(paymentType)) continue;
    const amount = asAmount(item.amount);
    if (amount <= 0) continue;
    const id = asInt(item.id);
    const submittedAt = asText(item.submitted_at, 40) || new Date().toISOString();
    const status = asText(item.status, 16) === 'approved' ? 'approved' : 'pending';
    if (id > 0) {
      statements.push(
        database
          .prepare(
            `INSERT${conflict} INTO online_payments (
               id, year_id, flat_id, payment_type, description, amount, link_account, status,
               bank, account_holder, applied_month, submitted_at, approved_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            asInt(item.year_id) || 1,
            flatId,
            paymentType,
            asText(item.description, 240),
            amount,
            asInt(item.link_account) ? 1 : 0,
            status,
            asText(item.bank, 80),
            asText(item.account_holder, 80),
            asText(item.applied_month, 16) || null,
            submittedAt,
            asText(item.approved_at, 40) || null,
          ),
      );
    } else if (!overwrite) {
      statements.push(
        database
          .prepare(
            `INSERT INTO online_payments (
               year_id, flat_id, payment_type, description, amount, link_account, status,
               bank, account_holder, applied_month, submitted_at, approved_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            asInt(item.year_id) || 1,
            flatId,
            paymentType,
            asText(item.description, 240),
            amount,
            asInt(item.link_account) ? 1 : 0,
            status,
            asText(item.bank, 80),
            asText(item.account_holder, 80),
            asText(item.applied_month, 16) || null,
            submittedAt,
            asText(item.approved_at, 40) || null,
          ),
      );
    }
  }

  for (const row of backup.tables.flat_bank_accounts) {
    const item = asRecord(row);
    const flatId = asText(item?.flat_id, 16);
    const bank = asText(item?.bank, 80);
    const holder = asText(item?.account_holder, 80);
    if (!item || !flatId || !bank || !holder) continue;
    const id = asInt(item.id);
    const lastUsed = asText(item.last_used_at, 40) || new Date().toISOString();
    if (id > 0) {
      statements.push(
        database
          .prepare(
            `INSERT${conflict} INTO flat_bank_accounts (
               id, flat_id, bank, account_holder, auto_sync, last_used_at
             ) VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(id, flatId, bank, holder, asInt(item.auto_sync) ? 1 : 0, lastUsed),
      );
    } else if (!overwrite) {
      statements.push(
        database
          .prepare(
            `INSERT INTO flat_bank_accounts (flat_id, bank, account_holder, auto_sync, last_used_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(flat_id, bank, account_holder) DO UPDATE SET
               auto_sync = CASE WHEN excluded.auto_sync = 1 THEN 1 ELSE flat_bank_accounts.auto_sync END,
               last_used_at = excluded.last_used_at`,
          )
          .bind(flatId, bank, holder, asInt(item.auto_sync) ? 1 : 0, lastUsed),
      );
    }
  }

  statements.push(lastUpdatedStatement());
  await runChunks(statements);
}
