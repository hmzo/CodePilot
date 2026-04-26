/**
 * Timezone boundary tests for local-date logic.
 *
 * Run with: npx tsx --test src/__tests__/unit/timezone-boundaries.test.ts
 *
 * Tests verify:
 * 1. getLocalDateString returns local (not UTC) date at timezone boundaries
 * 2. getTokenUsageStats buckets by local calendar day
 * 3. localDayStartAsUTC computes correct UTC boundary
 *
 * Strategy: use process.env.TZ to shift timezone during tests, and pass
 * fixed Date objects rather than calling the same helper to self-verify.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Set a temp data dir before importing db module
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepilot-tz-test-'));
process.env.CLAUDE_GUI_DATA_DIR = tmpDir;

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  getLocalDateString,
  localDayStartAsUTC,
} = require('../../lib/utils') as typeof import('../../lib/utils');

const {
  getDb,
  createSession,
  getTokenUsageStats,
  closeDb,
} = require('../../lib/db') as typeof import('../../lib/db');

// ---------------------------------------------------------------------------
// TZ helper: save/restore original TZ around tests
// ---------------------------------------------------------------------------
const originalTZ = process.env.TZ;

function setTZ(tz: string) {
  process.env.TZ = tz;
}

function restoreTZ() {
  if (originalTZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTZ;
  }
}

// ---------------------------------------------------------------------------
// 1. getLocalDateString at timezone boundaries
// ---------------------------------------------------------------------------
describe('getLocalDateString timezone boundaries', () => {
  afterEach(() => restoreTZ());

  it('UTC+9: UTC 2026-03-09 23:30 is local 2026-03-10 08:30', () => {
    setTZ('Asia/Tokyo'); // UTC+9
    const utcTime = new Date('2026-03-09T23:30:00Z');
    // Local time: 2026-03-10 08:30 JST
    assert.equal(getLocalDateString(utcTime), '2026-03-10');
  });

  it('UTC+9: UTC 2026-03-09 14:59 is still local 2026-03-09 23:59', () => {
    setTZ('Asia/Tokyo');
    const utcTime = new Date('2026-03-09T14:59:00Z');
    // Local: 2026-03-09 23:59 JST
    assert.equal(getLocalDateString(utcTime), '2026-03-09');
  });

  it('UTC+9: UTC 2026-03-09 15:00 crosses to local 2026-03-10 00:00', () => {
    setTZ('Asia/Tokyo');
    const utcTime = new Date('2026-03-09T15:00:00Z');
    // Local: 2026-03-10 00:00 JST — midnight
    assert.equal(getLocalDateString(utcTime), '2026-03-10');
  });

  it('UTC-5: UTC 2026-03-10 04:00 is still local 2026-03-09 23:00', () => {
    setTZ('America/New_York'); // UTC-5 (EST, no DST in March 2026 after spring forward)
    // Actually March 2026 is after spring forward (2nd Sunday of March)
    // So it's EDT = UTC-4. UTC 04:00 → local 00:00 EDT on March 10.
    // Let's use a January date to ensure EST (UTC-5).
    const utcTime = new Date('2026-01-10T04:30:00Z');
    // EST: 2026-01-09 23:30
    assert.equal(getLocalDateString(utcTime), '2026-01-09');
  });

  it('UTC: date should match ISO date', () => {
    setTZ('UTC');
    const utcTime = new Date('2026-03-09T23:59:00Z');
    assert.equal(getLocalDateString(utcTime), '2026-03-09');
  });
});

// ---------------------------------------------------------------------------
// 2. localDayStartAsUTC computes correct UTC boundary
// ---------------------------------------------------------------------------
describe('localDayStartAsUTC', () => {
  afterEach(() => restoreTZ());

  it('UTC+8: local midnight is UTC 16:00 previous day', () => {
    setTZ('Asia/Shanghai');
    // Fix "now" to local 2026-03-10 10:00 (= UTC 2026-03-10 02:00)
    const now = new Date('2026-03-10T02:00:00Z');
    const result = localDayStartAsUTC(0, now);
    // Local midnight of 2026-03-10 = UTC 2026-03-09 16:00:00
    assert.equal(result, '2026-03-09 16:00:00');
  });

  it('UTC-5: local midnight is UTC 05:00 same day', () => {
    setTZ('EST'); // fixed UTC-5, no DST
    const now = new Date('2026-01-10T12:00:00Z'); // local 07:00
    const result = localDayStartAsUTC(0, now);
    // Local midnight 2026-01-10 = UTC 2026-01-10 05:00:00
    assert.equal(result, '2026-01-10 05:00:00');
  });

  it('daysAgo=1 returns yesterday local midnight in UTC', () => {
    setTZ('Asia/Shanghai');
    const now = new Date('2026-03-10T02:00:00Z');
    const result = localDayStartAsUTC(1, now);
    // Local midnight of 2026-03-09 = UTC 2026-03-08 16:00:00
    assert.equal(result, '2026-03-08 16:00:00');
  });
});

// ---------------------------------------------------------------------------
// 5. getTokenUsageStats buckets by local calendar day
// ---------------------------------------------------------------------------
describe('getTokenUsageStats local bucketing', () => {
  afterEach(() => restoreTZ());

  it('UTC+9: message at UTC 23:30 should bucket into next local day', () => {
    setTZ('Asia/Tokyo');

    const db = getDb();

    // Create a session
    const session = createSession('tz-test', '', undefined, '/tmp/tz-test');

    // Insert a message at UTC 2026-03-09 23:30 (= JST 2026-03-10 08:30)
    // Use raw SQL to control the exact timestamp
    db.prepare(`
      INSERT INTO messages (id, session_id, role, content, created_at, token_usage)
      VALUES (?, ?, 'assistant', 'test', '2026-03-09 23:30:00', ?)
    `).run(
      'tz-msg-1',
      session.id,
      JSON.stringify({ input_tokens: 100, output_tokens: 50, cost_usd: 0.001 })
    );

    // Insert another message at UTC 2026-03-09 14:00 (= JST 2026-03-09 23:00)
    db.prepare(`
      INSERT INTO messages (id, session_id, role, content, created_at, token_usage)
      VALUES (?, ?, 'assistant', 'test2', '2026-03-09 14:00:00', ?)
    `).run(
      'tz-msg-2',
      session.id,
      JSON.stringify({ input_tokens: 200, output_tokens: 100, cost_usd: 0.002 })
    );

    // Pin "now" to March 11 JST so the 2-day window always includes our test data.
    const pinned = new Date('2026-03-10T16:00:00Z'); // = JST 2026-03-11 01:00
    const stats = getTokenUsageStats(7, pinned);

    // Find the daily entries for these messages
    const day09 = stats.daily.filter(d => d.date === '2026-03-09');
    const day10 = stats.daily.filter(d => d.date === '2026-03-10');

    // msg-2 (UTC 14:00 = JST 23:00 on March 9) should be in March 9 bucket
    const day09Tokens = day09.reduce((sum, d) => sum + d.input_tokens + d.output_tokens, 0);
    assert.equal(day09Tokens, 300, 'March 9 local should have msg-2 (200+100 tokens)');

    // msg-1 (UTC 23:30 = JST 08:30 on March 10) should be in March 10 bucket
    const day10Tokens = day10.reduce((sum, d) => sum + d.input_tokens + d.output_tokens, 0);
    assert.equal(day10Tokens, 150, 'March 10 local should have msg-1 (100+50 tokens)');

    // Cleanup
    db.prepare('DELETE FROM messages WHERE id IN (?, ?)').run('tz-msg-1', 'tz-msg-2');
    db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(session.id);
  });

  it('summary window uses local day boundary', () => {
    setTZ('Asia/Tokyo');

    const db = getDb();
    const session = createSession('tz-test-2', '', undefined, '/tmp/tz-test-2');

    // Insert a message just before local midnight (UTC 14:59 = JST 23:59 on March 9)
    db.prepare(`
      INSERT INTO messages (id, session_id, role, content, created_at, token_usage)
      VALUES (?, ?, 'assistant', 'edge', '2026-03-09 14:59:00', ?)
    `).run(
      'tz-edge-1',
      session.id,
      JSON.stringify({ input_tokens: 500, output_tokens: 250, cost_usd: 0.005 })
    );

    // Pin "now" to JST March 10 so the window includes our test data.
    const pinned = new Date('2026-03-10T00:00:00Z'); // = JST 2026-03-10 09:00
    const stats = getTokenUsageStats(7, pinned);
    const entry = stats.daily.find(d => d.date === '2026-03-09');
    assert.ok(entry, 'Should find entry bucketed in local March 9');
    assert.ok(entry!.input_tokens >= 500, 'Should include our message tokens');

    // The same message should NOT appear in March 10 bucket
    const day10Entry = stats.daily.find(d => d.date === '2026-03-10');
    const day10Has = day10Entry ? day10Entry.input_tokens >= 500 : false;
    assert.equal(day10Has, false, 'Should NOT bucket UTC March 9 14:59 into local March 10');

    // Cleanup
    db.prepare('DELETE FROM messages WHERE id = ?').run('tz-edge-1');
    db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(session.id);
  });
});

// ---------------------------------------------------------------------------
// 6. DST transition: bucketing uses per-row offset, not a single current offset
// ---------------------------------------------------------------------------
describe('getTokenUsageStats DST transition', () => {
  afterEach(() => restoreTZ());

  it('messages across US DST spring-forward bucket by correct local date', () => {
    // US spring forward 2026: March 8, 2:00 AM local → 3:00 AM (UTC-5 → UTC-4)
    // Before: EST = UTC-5.  After: EDT = UTC-4.
    setTZ('America/New_York');

    const db = getDb();
    const session = createSession('dst-test', '', undefined, '/tmp/dst-test');

    // Message BEFORE spring-forward: March 7, 11:00 PM EST = March 8 04:00 UTC
    // Local date: March 7
    db.prepare(`
      INSERT INTO messages (id, session_id, role, content, created_at, token_usage)
      VALUES (?, ?, 'assistant', 'before-dst', '2026-03-08 04:00:00', ?)
    `).run(
      'dst-msg-1',
      session.id,
      JSON.stringify({ input_tokens: 100, output_tokens: 50, cost_usd: 0.001 })
    );

    // Message AFTER spring-forward: March 8, 11:00 PM EDT = March 9 03:00 UTC
    // Local date: March 8
    db.prepare(`
      INSERT INTO messages (id, session_id, role, content, created_at, token_usage)
      VALUES (?, ?, 'assistant', 'after-dst', '2026-03-09 03:00:00', ?)
    `).run(
      'dst-msg-2',
      session.id,
      JSON.stringify({ input_tokens: 200, output_tokens: 100, cost_usd: 0.002 })
    );

    // Pin "now" to local March 10 EDT so the window includes both test messages.
    const pinned = new Date('2026-03-10T12:00:00Z'); // = EDT 2026-03-10 08:00
    const stats = getTokenUsageStats(7, pinned);

    const mar7 = stats.daily.filter(d => d.date === '2026-03-07');
    const mar8 = stats.daily.filter(d => d.date === '2026-03-08');

    const mar7Tokens = mar7.reduce((sum, d) => sum + d.input_tokens + d.output_tokens, 0);
    const mar8Tokens = mar8.reduce((sum, d) => sum + d.input_tokens + d.output_tokens, 0);

    // msg-1 (UTC 04:00 March 8 → EST 23:00 March 7) should be in March 7 bucket
    assert.equal(mar7Tokens, 150, 'March 7 local should have msg-1 (pre-DST, 100+50)');

    // msg-2 (UTC 03:00 March 9 → EDT 23:00 March 8) should be in March 8 bucket
    assert.equal(mar8Tokens, 300, 'March 8 local should have msg-2 (post-DST, 200+100)');

    // If a single offset were used (e.g. current EDT = UTC-4):
    // msg-1 would be UTC 04:00 + (-4h) = 00:00 March 8 → WRONG (should be March 7)
    // This test proves per-row DST-aware bucketing works.

    // Cleanup
    db.prepare('DELETE FROM messages WHERE id IN (?, ?)').run('dst-msg-1', 'dst-msg-2');
    db.prepare('DELETE FROM chat_sessions WHERE id = ?').run(session.id);
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
describe('cleanup', () => {
  it('close db', () => {
    closeDb();
  });
});
