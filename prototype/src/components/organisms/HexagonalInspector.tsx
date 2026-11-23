import React from 'react';
import { Card } from '../atoms/Card';
import { Button } from '../atoms/Button';
import { Badge } from '../atoms/Badge';
import { Icon } from '../atoms/Icon';
import { useDomain } from '../../context/DomainContext';

export const HexagonalInspector: React.FC = () => {
  const { runtimeMode, activeDbAdapter, setActiveDbAdapter } = useDomain();
  const isIntegrated = runtimeMode === 'INTEGRATED_API';

  const parnasSecrets = [
    {
      id: 'secret-1',
      secretTitle: 'Secret 1: Telemetry Transport & Deduplication Store',
      description: 'HTTP/JSON local dev ingress vs future Protobuf/mTLS gateway, plus PostgreSQL UNIQUE deduplication vs in-memory dedup.',
      hiddenMechanism: 'Isolated behind ITelemetryBatchPersistence and ObservationDedupStore ports; pure domain validation stays unchanged.',
      stablePort: 'Port: ITelemetryBatchPersistence & MeterRegistry',
    },
    {
      id: 'secret-2',
      secretTitle: 'Secret 2: Incident Persistence, CAS & Atomic Outbox',
      description: 'PostgreSQL 16 ACID transactions vs InMemory Map vs Validated JSON Fixture stores.',
      hiddenMechanism: 'Hidden behind IIncidentRepository (expectedVersion CAS + commandId idempotency). Identical conformance tests verify all three adapters.',
      stablePort: 'Port: IIncidentRepository (Postgres / InMemory / JSON)',
    },
    {
      id: 'secret-3',
      secretTitle: 'Secret 3: Authoritative Clock & Verification Policy',
      description: 'Wall-clock server time in Integrated Mode vs deterministic FixedClock seam in automated tests.',
      hiddenMechanism: 'Injected via Clock interface into validation, MNF night-window evaluation, and incident transitions.',
      stablePort: 'Port: Clock (SystemClock / FixedClock)',
    },
  ];

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <h3 className="text-sm font-bold font-mono text-slate-100 flex items-center gap-2">
            <Icon name="server" size={16} className="text-cyan-primary" />
            Hexagonal Architecture (Ports &amp; Adapters) &amp; Parnas Secrets
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Lecture 4: Pure TypeScript domain core shared identically across PostgreSQL 16 HTTP API and browser adapters
          </p>
        </div>

        {!isIntegrated && (
          <div className="flex items-center gap-2 bg-navy-950 p-1.5 rounded-xl border border-slate-800">
            <span className="text-xs font-mono text-slate-400 px-2">Demo isolated adapter:</span>
            <Button
              size="sm"
              variant={activeDbAdapter === 'IN_MEMORY' ? 'primary' : 'ghost'}
              onClick={() => setActiveDbAdapter('IN_MEMORY')}
            >
              InMemory Repository
            </Button>
            <Button
              size="sm"
              variant={activeDbAdapter === 'VALIDATED_FIXTURE' ? 'primary' : 'ghost'}
              onClick={() => setActiveDbAdapter('VALIDATED_FIXTURE')}
            >
              JSON Fixture Repository
            </Button>
          </div>
        )}
      </Card>

      <Card
        glow
        borderVariant={isIntegrated ? 'emerald' : activeDbAdapter === 'IN_MEMORY' ? 'cyan' : 'emerald'}
        className="p-4 bg-navy-900/90"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-navy-950 text-cyan-primary border border-slate-800">
              <Icon name="server" size={20} />
            </div>
            <div>
              <div className="text-xs font-mono font-bold text-slate-100">
                {isIntegrated
                  ? 'IIncidentRepository → PostgresIncidentRepository (PostgreSQL 16 via /v1 HTTP API)'
                  : activeDbAdapter === 'IN_MEMORY'
                  ? 'IIncidentRepository → InMemoryIncidentRepository (Isolated Demo Store)'
                  : 'IIncidentRepository → ValidatedJsonFixtureIncidentRepository (Isolated Demo Store)'}
              </div>
              <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                {isIntegrated
                  ? 'Durable ACID persistence with expectedVersion CAS, command_id idempotency, audit_events, and notification_outbox.'
                  : 'Note: Switching demo adapters selects an isolated in-memory store with its own seed state; it does NOT migrate records between repositories.'}
              </div>
            </div>
          </div>
          <Badge variant={isIntegrated ? 'nominal' : 'info'} showDot>
            {isIntegrated
              ? 'PostgreSQL 16 Active'
              : activeDbAdapter === 'IN_MEMORY'
              ? 'Demo In-Memory'
              : 'Demo JSON Fixture'}
          </Badge>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {parnasSecrets.map((secret) => (
          <Card key={secret.id} hoverable className="flex flex-col justify-between space-y-3">
            <div>
              <span className="text-xs font-mono font-bold text-cyan-primary">
                {secret.secretTitle}
              </span>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">{secret.description}</p>
            </div>
            <div className="pt-3 border-t border-slate-800 space-y-2 text-xs font-mono">
              <div className="text-slate-400">{secret.hiddenMechanism}</div>
              <div className="p-2 rounded bg-navy-950 text-emerald-brand text-[11px] border border-emerald-brand/20">
                {secret.stablePort}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
