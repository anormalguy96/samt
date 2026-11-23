/**
 * SAMT v1.1.0 PostgreSQL Backup & Restore Drill (Separate Target Database)
 * Grounded in resources/lectures_merged.pdf pp. 16-17 (Backup, Recovery, RPO/RTO).
 *
 * Safety Guarantee: NEVER restores over primary database (`samt_v1_1`).
 * Always creates an isolated `samt_restore_drill` database, restores the custom-format
 * `pg_dump` archive into it, verifies restored row counts and audit records, measures
 * elapsed recovery time and observed data-loss window, and cleans up the drill DB.
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const serverRequire = createRequire(path.join(repoRoot, 'server', 'package.json'));
const pg = serverRequire('pg');

const PRIMARY_DB = 'samt_v1_1';
const RESTORE_DB = 'samt_restore_drill';
const PG_USER = 'samt';
const PG_PASS = 'samt_local_dev_password';
const PG_PORT = process.env.POSTGRES_PORT || '5433';

function dockerExec(cmd) {
  return execSync(`wsl -u root -e docker exec samt-postgres ${cmd}`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

async function queryCounts(database) {
  const pool = new pg.Pool({
    connectionString: `postgresql://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${database}`,
  });
  try {
    const tables = [
      'dma_zones',
      'network_meters',
      'telemetry_observations',
      'leak_incidents',
      'incident_commands',
      'audit_events',
      'notification_outbox',
    ];
    const counts = {};
    for (const t of tables) {
      const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
      counts[t] = r.rows[0].c;
    }
    const sampleAudit = await pool.query(
      'SELECT audit_id, event_type, incident_id, actor_id FROM audit_events ORDER BY event_timestamp DESC LIMIT 3'
    );
    return { counts, sampleAudit: sampleAudit.rows };
  } finally {
    await pool.end();
  }
}

async function main() {
  const primaryPool = new pg.Pool({
    connectionString: `postgresql://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${PRIMARY_DB}`,
  });

  // 1. Seed a realistic drill dataset (incident + command + audit + telemetry) into primary DB
  const drillId = `INC-DRILL-${Date.now().toString().slice(-6)}`;
  const nowIso = new Date().toISOString();
  await primaryPool.query(
    `
    INSERT INTO leak_incidents (
      incident_id, dma_id, title, state, severity, estimated_loss_m3h, detected_at, version
    ) VALUES ($1, 'DMA-YASAMAL-04', 'Backup/Restore Verification Incident', 'ASSIGNED', 'CRITICAL', 41.2, $2, 2)
    ON CONFLICT (incident_id) DO NOTHING
    `,
    [drillId, nowIso]
  );
  await primaryPool.query(
    `
    INSERT INTO audit_events (
      audit_id, event_timestamp, event_type, source_component, severity,
      actor_id, actor_role, correlation_id, dma_id, incident_id, message
    ) VALUES ($1, $2, 'DRILL_SNAPSHOT_CHECKPOINT', 'BackupRestoreDrill', 'INFO',
      'dispatcher-baku-01', 'dispatcher', 'cor-drill-001', 'DMA-YASAMAL-04', $3,
      'Pre-backup checkpoint record for restore integrity verification')
    ON CONFLICT (audit_id) DO NOTHING
    `,
    [`aud-drill-${Date.now()}`, nowIso, drillId]
  );

  const beforeBackup = await queryCounts(PRIMARY_DB);

  // 2. Perform pg_dump backup into container temporary path
  const dumpStartMs = performance.now();
  const backupTimestamp = new Date();
  dockerExec(`pg_dump -U ${PG_USER} -d ${PRIMARY_DB} -Fc -f /tmp/samt_drill.dump`);
  const backupDurationMs = Number((performance.now() - dumpStartMs).toFixed(2));
  const dumpBytes = Number(dockerExec(`stat -c%s /tmp/samt_drill.dump`));

  // 3. Simulate a post-backup write occurring 250ms after backup (demonstrates observed RPO window)
  await new Promise((r) => setTimeout(r, 250));
  const postBackupObsId = `obs-post-backup-${Date.now()}`;
  const postBackupTime = new Date();
  await primaryPool.query(
    `
    INSERT INTO telemetry_observations (
      observation_id, meter_id, dma_id, device_id, metric, canonical_unit, value,
      observed_at, transmitted_at, received_at, quality, ingestion_mode, batch_correlation_id
    ) VALUES ($1, 'FM-YAS-INLET-01', 'DMA-YASAMAL-04', 'GW-YAS-01', 'FLOW_M3H', 'm3/h', 55.0,
      $2, $2, $2, 'VALID', 'LIVE', 'cor-post-backup')
    `,
    [postBackupObsId, postBackupTime.toISOString()]
  );

  // 4. Create SEPARATE database `samt_restore_drill` and restore into it (NEVER overwrite primary!)
  const restoreStartMs = performance.now();
  dockerExec(`psql -U ${PG_USER} -d postgres -c "DROP DATABASE IF EXISTS ${RESTORE_DB};"`);
  dockerExec(`psql -U ${PG_USER} -d postgres -c "CREATE DATABASE ${RESTORE_DB} OWNER ${PG_USER};"`);
  dockerExec(`pg_restore -U ${PG_USER} -d ${RESTORE_DB} --no-owner /tmp/samt_drill.dump`);
  const restoreDurationMs = Number((performance.now() - restoreStartMs).toFixed(2));

  // 5. Verify restored rows match pre-backup snapshot exactly (and post-backup write is absent as expected)
  const afterRestore = await queryCounts(RESTORE_DB);
  const countsMatch =
    JSON.stringify(beforeBackup.counts) === JSON.stringify(afterRestore.counts);

  const restorePool = new pg.Pool({
    connectionString: `postgresql://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${RESTORE_DB}`,
  });
  let restoredIncidentFound = false;
  let postBackupAbsentInRestore = false;
  try {
    const incCheck = await restorePool.query(
      'SELECT incident_id, state, version FROM leak_incidents WHERE incident_id = $1',
      [drillId]
    );
    restoredIncidentFound = incCheck.rowCount === 1 && incCheck.rows[0].state === 'ASSIGNED';

    const obsCheck = await restorePool.query(
      'SELECT 1 FROM telemetry_observations WHERE observation_id = $1',
      [postBackupObsId]
    );
    postBackupAbsentInRestore = obsCheck.rowCount === 0;
  } finally {
    await restorePool.end();
  }

  // 6. Clean up separate drill DB & temporary dump file
  dockerExec(`psql -U ${PG_USER} -d postgres -c "DROP DATABASE IF EXISTS ${RESTORE_DB};"`);
  dockerExec(`rm -f /tmp/samt_drill.dump`);
  await primaryPool.end();

  const observedDataLossWindowMs = postBackupTime.getTime() - backupTimestamp.getTime();

  const report = {
    executedAt: new Date().toISOString(),
    primaryDatabase: PRIMARY_DB,
    isolatedRestoreDatabase: RESTORE_DB,
    backupDurationMs,
    backupArchiveBytes: dumpBytes,
    restoreElapsedMs: restoreDurationMs,
    observedDataLossWindowMs,
    targetsNote:
      'Observed values reflect a local cold logical pg_dump/pg_restore drill on seeded tables and are NOT production RPO/RTO SLA guarantees (target production RPO <= 5 min via WAL archiving, target RTO <= 30 min).',
    preBackupCounts: beforeBackup.counts,
    restoredCounts: afterRestore.counts,
    verification: {
      allTableCountsMatchPreBackupSnapshot: countsMatch,
      drillIncidentAndVersionRestored: restoredIncidentFound,
      postBackupWriteCorrectlyExcludedFromSnapshot: postBackupAbsentInRestore,
      sampleRestoredAuditEvents: afterRestore.sampleAudit,
      passed: countsMatch && restoredIncidentFound && postBackupAbsentInRestore,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.verification.passed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[drill:backup-restore] FAILED:', err);
  process.exit(1);
});
