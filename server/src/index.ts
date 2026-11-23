import { loadConfig, redactDatabaseUrl } from './config.js';
import { createDbPool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';
import { PostgresIncidentRepository } from './repositories/PostgresIncidentRepository.js';
import {
  PostgresMeterRegistry,
  PostgresTelemetryRepository,
} from './repositories/PostgresTelemetryRepository.js';
import { PostgresAuditAndAllocationRepository } from './repositories/PostgresAuditAndAllocationRepository.js';
import {
  createHttpOutboxDelivery,
  OutboxDispatcher,
} from './outbox/OutboxDispatcher.js';
import { LocalNotificationReceiver } from './outbox/LocalNotificationReceiver.js';
import { createApp } from './http/app.js';

async function main() {
  const config = loadConfig();
  const pool = createDbPool(config.databaseUrl);

  console.log(`[samt-api] Starting SAMT v1.1.0 API (DB: ${redactDatabaseUrl(config.databaseUrl)})`);

  await runMigrations(pool);
  await seedDatabase(pool);

  const meterRegistry = new PostgresMeterRegistry(pool);
  await meterRegistry.refresh();

  const telemetryRepo = new PostgresTelemetryRepository(pool);
  const incidentRepo = new PostgresIncidentRepository(pool);
  const auditRepo = new PostgresAuditAndAllocationRepository(pool);

  const localReceiver = new LocalNotificationReceiver();
  const deliveryHandler = config.notificationReceiverUrl
    ? createHttpOutboxDelivery(config.notificationReceiverUrl)
    : async (record: {
        outboxId: string;
        idempotencyKey: string;
        incidentId: string | null;
        dmaId: string | null;
        recipient: string;
        severity: string;
        message: string;
        payload: Record<string, unknown>;
      }) => {
        const res = localReceiver.handleDelivery(record.idempotencyKey, {
          outboxId: record.outboxId,
          incidentId: record.incidentId,
          dmaId: record.dmaId,
          recipient: record.recipient,
          severity: record.severity,
          message: record.message,
          payload: record.payload,
        });
        if (res.status !== 200) {
          throw new Error(`Local receiver returned status ${res.status}`);
        }
      };

  const outboxDispatcher = new OutboxDispatcher(pool, deliveryHandler, 500);

  const app = createApp({
    config,
    pool,
    meterRegistry,
    telemetryRepo,
    incidentRepo,
    auditRepo,
    outboxDispatcher,
  });

  const server = app.listen(config.port, config.host, () => {
    console.log(`[samt-api] Listening on http://${config.host}:${config.port} (API root: /v1)`);
  });

  const outboxInterval = setInterval(() => {
    outboxDispatcher.processDue().catch((err) => {
      console.error('[samt-outbox] Poll error:', err instanceof Error ? err.message : String(err));
    });
  }, 5000);
  outboxInterval.unref();

  const shutdown = async () => {
    clearInterval(outboxInterval);
    server.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[samt-api] Fatal startup error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
