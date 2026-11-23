import fs from 'node:fs';
import path from 'node:path';

export interface ServerConfig {
  port: number;
  host: string;
  corsOrigin: string;
  databaseUrl: string;
  viewerToken: string;
  dispatcherToken: string;
  deviceTokens: Record<string, string>; // token -> deviceId
  notificationReceiverUrl?: string;
}

function loadDotEnvIfPresent(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

export function loadConfig(envOverrides?: Partial<NodeJS.ProcessEnv>): ServerConfig {
  const envCandidates = [
    path.resolve(import.meta.dirname, '..', '..', '.env'),
    path.resolve(import.meta.dirname, '..', '..', '..', '..', '.env'),
  ];
  for (const envPath of envCandidates) {
    loadDotEnvIfPresent(envPath);
  }

  const env = { ...process.env, ...envOverrides };

  const defaultDeviceTokens: Record<string, string> = {
    'samt-dev-device-yas-01': 'GW-YAS-01',
    'samt-dev-device-yas-02': 'GW-YAS-02',
    'samt-dev-device-nas-01': 'GW-NAS-01',
  };

  let deviceTokens = defaultDeviceTokens;
  if (env.SAMT_DEVICE_TOKENS_JSON) {
    try {
      const parsed = JSON.parse(env.SAMT_DEVICE_TOKENS_JSON) as Record<string, unknown>;
      const valid: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && v.trim().length > 0) {
          valid[k] = v.trim();
        }
      }
      deviceTokens = valid;
    } catch {
      throw new Error('Invalid JSON in SAMT_DEVICE_TOKENS_JSON environment variable');
    }
  }

  return {
    port: Number(env.PORT ?? 8080),
    host: env.HOST ?? '127.0.0.1',
    corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:3000',
    databaseUrl:
      env.DATABASE_URL ?? 'postgresql://samt:samt_local_dev_password@localhost:5433/samt_v1_1',
    viewerToken: env.SAMT_VIEWER_TOKEN ?? 'samt-dev-viewer-token',
    dispatcherToken: env.SAMT_DISPATCHER_TOKEN ?? 'samt-dev-dispatcher-token',
    deviceTokens,
    notificationReceiverUrl: env.NOTIFICATION_RECEIVER_URL || undefined,
  };
}

/**
 * Masks credentials from a PostgreSQL connection string before logging.
 */
export function redactDatabaseUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '[redacted-database-url]';
  }
}
