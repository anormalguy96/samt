/**
 * SAMT v1.1.0 Contract Validation Script
 * 1. Validates contracts/openapi.yaml (OpenAPI 3.1.0 structure + schema refs)
 * 2. Compiles contracts/telemetry.proto with the REAL `protoc` compiler binary
 * 3. Encodes a named 60-record synthetic fixture with protobufjs to measure exact
 *    uncompressed and gzipped wire bytes (replacing unmeasured size estimates)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(import.meta.dirname, '..');
const serverRequire = createRequire(path.join(repoRoot, 'server', 'package.json'));

const SwaggerParser = serverRequire('@apidevtools/swagger-parser');
const protobuf = serverRequire('protobufjs');

async function validateOpenApi() {
  const openApiPath = path.join(repoRoot, 'contracts', 'openapi.yaml');
  // Parse & dereference OpenAPI 3.1.0 specification and assert structural integrity
  const api = await SwaggerParser.dereference(openApiPath);
  if (api.openapi !== '3.1.0') {
    throw new Error(`Expected OpenAPI 3.1.0, found ${api.openapi}`);
  }
  if (api.info?.version !== '1.1.0') {
    throw new Error(`Expected API version 1.1.0, found ${api.info?.version}`);
  }
  const routeKeys = Object.keys(api.paths ?? {});
  if (routeKeys.length < 10) {
    throw new Error(`Expected at least 10 documented /v1 routes, found ${routeKeys.length}`);
  }
  // Ensure no invalid OpenAPI 3.0 mutualTLS scheme remains
  const schemes = api.components?.securitySchemes ?? {};
  for (const [name, scheme] of Object.entries(schemes)) {
    if (scheme.type === 'mutualTLS') {
      throw new Error(`Security scheme ${name} should not declare active mutualTLS in v1.1.0 local contract`);
    }
  }
  return {
    openapi: api.openapi,
    version: api.info.version,
    routeCount: routeKeys.length,
    routes: routeKeys,
    securitySchemes: Object.keys(schemes),
  };
}

function findProtocBinary() {
  const candidates = [
    path.join(repoRoot, 'server', 'node_modules', 'grpc-tools', 'bin', 'protoc.exe'),
    path.join(repoRoot, 'server', 'node_modules', 'grpc-tools', 'bin', 'protoc'),
    'protoc',
  ];
  for (const c of candidates) {
    if (c === 'protoc' || fs.existsSync(c)) {
      return c;
    }
  }
  throw new Error('Could not locate a real protoc binary');
}

function compileProtobuf() {
  const protoc = findProtocBinary();
  const protoDir = path.join(repoRoot, 'contracts');
  const protoFile = path.join(protoDir, 'telemetry.proto');
  const outDesc = path.join(os.tmpdir(), `samt-telemetry-v1-${Date.now()}.pb`);

  const versionOut = execFileSync(protoc, ['--version'], { encoding: 'utf8' }).trim();
  execFileSync(
    protoc,
    [`-I${protoDir}`, `--descriptor_set_out=${outDesc}`, '--include_imports', protoFile],
    { encoding: 'utf8' }
  );

  const stat = fs.statSync(outDesc);
  fs.unlinkSync(outDesc);

  return {
    compiler: protoc,
    compilerVersion: versionOut,
    descriptorBytes: stat.size,
  };
}

async function measureNamedProtobufFixture() {
  const protoPath = path.join(repoRoot, 'contracts', 'telemetry.proto');
  const root = await protobuf.load(protoPath);
  const TelemetryBatch = root.lookupType('samt.telemetry.v1.TelemetryBatch');

  // Named fixture: yasamal_dma04_60_records_15s_window
  const baseMs = Date.parse('2026-10-20T02:00:00+04:00');
  const records = [];
  for (let i = 0; i < 60; i++) {
    records.push({
      observationId: `obs-yas-20261020-${String(i).padStart(3, '0')}`,
      meterId: 'FM-YAS-INLET-01',
      dmaId: 'DMA-YASAMAL-04',
      observedAtUnixMs: baseMs + i * 15000,
      metricType: 1, // METRIC_TYPE_FLOW_M3H
      canonicalUnit: 1, // CANONICAL_UNIT_M3_PER_HOUR
      value: 100.0 + (i % 5) * 0.25,
      batteryVolts: 3.6,
      localQuality: 1, // OBSERVATION_QUALITY_VALID
    });
  }

  const fixturePayload = {
    deviceId: 'GW-YAS-01',
    dmaId: 'DMA-YASAMAL-04',
    transmittedAtUnixMs: baseMs + 60 * 15000,
    sequenceId: 1042,
    callerHistoricalHint: false,
    records,
  };

  const verifyErr = TelemetryBatch.verify(fixturePayload);
  if (verifyErr) {
    throw new Error(`Protobuf fixture verification failed: ${verifyErr}`);
  }

  const message = TelemetryBatch.create(fixturePayload);
  const encoded = TelemetryBatch.encode(message).finish();
  const gzipped = zlib.gzipSync(encoded);
  const jsonBytes = Buffer.byteLength(JSON.stringify(fixturePayload), 'utf8');

  return {
    fixtureName: 'yasamal_dma04_60_records_15s_window',
    recordCount: records.length,
    protobufBytes: encoded.length,
    protobufGzipBytes: gzipped.length,
    equivalentJsonBytes: jsonBytes,
    bytesPerRecordAvg: Number((encoded.length / records.length).toFixed(2)),
  };
}

async function main() {
  const openApi = await validateOpenApi();
  const protoCompile = compileProtobuf();
  const fixture = await measureNamedProtobufFixture();

  const report = {
    checkedAt: new Date().toISOString(),
    openApi,
    protoCompile,
    fixture,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error('[contracts:check] FAILED:', err);
  process.exit(1);
});
