/**
 * Standard Meter Registry Fixture (Lectures 2 & 3: Information Hiding & Registry Pattern)
 * Defines known physical meters across pilot DMAs with explicit hydraulic roles,
 * active flags, device-to-meter/DMA bindings, compatible metrics, and canonical units.
 */

import type { MeterDefinition, MeterRegistry } from '../ports/TelemetryPort.js';

export const INITIAL_METERS: MeterDefinition[] = [
  // Yasamal DMA-04 (Primary synthetic operational workflow DMA with two inlets for multi-meter tests)
  {
    meterId: 'FM-YAS-INLET-01',
    dmaId: 'DMA-YASAMAL-04',
    role: 'INLET',
    name: 'Yasamal Əsas Giriş Sayğacı #1 (H. Cavid)',
    minNormalValue: 10,
    maxNormalValue: 600,
    isActive: true,
    boundDeviceId: 'GW-YAS-01',
    allowedMetrics: ['FLOW_M3H'],
    canonicalUnit: 'm3/h',
  },
  {
    meterId: 'FM-YAS-INLET-02',
    dmaId: 'DMA-YASAMAL-04',
    role: 'INLET',
    name: 'Yasamal İkinci Giriş Sayğacı #2 (Şərifzadə)',
    minNormalValue: 10,
    maxNormalValue: 600,
    isActive: true,
    boundDeviceId: 'GW-YAS-02',
    allowedMetrics: ['FLOW_M3H'],
    canonicalUnit: 'm3/h',
  },
  {
    meterId: 'FM-YAS-OUTLET-01',
    dmaId: 'DMA-YASAMAL-04',
    role: 'OUTLET',
    name: 'Yasamal Tranzit Çıxış Sayğacı (B. Vahabzadə)',
    minNormalValue: 0,
    maxNormalValue: 400,
    isActive: true,
    boundDeviceId: 'GW-YAS-01',
    allowedMetrics: ['FLOW_M3H'],
    canonicalUnit: 'm3/h',
  },
  {
    meterId: 'PT-YAS-PRESSURE-01',
    dmaId: 'DMA-YASAMAL-04',
    role: 'PRESSURE_MONITOR',
    name: 'Yasamal Təzyiq Transdüseri (Kritik Qovşaq)',
    minNormalValue: 1.5,
    maxNormalValue: 8.0,
    isActive: true,
    boundDeviceId: 'GW-YAS-01',
    allowedMetrics: ['PRESSURE_BAR'],
    canonicalUnit: 'bar',
  },
  {
    meterId: 'FM-YAS-INACTIVE-99',
    dmaId: 'DMA-YASAMAL-04',
    role: 'INLET',
    name: 'Yasamal Deaktiv Sayğac (Test Fixture)',
    minNormalValue: 0,
    maxNormalValue: 400,
    isActive: false,
    boundDeviceId: 'GW-YAS-01',
    allowedMetrics: ['FLOW_M3H'],
    canonicalUnit: 'm3/h',
  },

  // Nəsimi DMA-02 (Second DMA for strict cross-DMA isolation testing)
  {
    meterId: 'FM-NAS-INLET-01',
    dmaId: 'DMA-NASIMI-02',
    role: 'INLET',
    name: 'Nəsimi Giriş Sayğacı (28 May)',
    minNormalValue: 20,
    maxNormalValue: 700,
    isActive: true,
    boundDeviceId: 'GW-NAS-01',
    allowedMetrics: ['FLOW_M3H'],
    canonicalUnit: 'm3/h',
  },
  {
    meterId: 'FM-NAS-OUTLET-01',
    dmaId: 'DMA-NASIMI-02',
    role: 'OUTLET',
    name: 'Nəsimi Çıxış Sayğacı (D. Əliyeva)',
    minNormalValue: 0,
    maxNormalValue: 500,
    isActive: true,
    boundDeviceId: 'GW-NAS-01',
    allowedMetrics: ['FLOW_M3H'],
    canonicalUnit: 'm3/h',
  },
  {
    meterId: 'PT-NAS-PRESSURE-01',
    dmaId: 'DMA-NASIMI-02',
    role: 'PRESSURE_MONITOR',
    name: 'Nəsimi Təzyiq Sensoru',
    minNormalValue: 1.5,
    maxNormalValue: 7.0,
    isActive: true,
    boundDeviceId: 'GW-NAS-01',
    allowedMetrics: ['PRESSURE_BAR'],
    canonicalUnit: 'bar',
  },

  // Nizami DMA-07
  {
    meterId: 'FM-NIZ-INLET-01',
    dmaId: 'DMA-NIZAMI-07',
    role: 'INLET',
    name: 'Nizami Giriş Sayğacı (Q. Qarayev)',
    minNormalValue: 20,
    maxNormalValue: 800,
    isActive: true,
    boundDeviceId: 'GW-NIZ-01',
    allowedMetrics: ['FLOW_M3H'],
    canonicalUnit: 'm3/h',
  },
  {
    meterId: 'FM-NIZ-OUTLET-01',
    dmaId: 'DMA-NIZAMI-07',
    role: 'OUTLET',
    name: 'Nizami Çıxış Sayğacı (Neftçilər)',
    minNormalValue: 0,
    maxNormalValue: 700,
    isActive: true,
    boundDeviceId: 'GW-NIZ-01',
    allowedMetrics: ['FLOW_M3H'],
    canonicalUnit: 'm3/h',
  },

  // Səbail DMA-01
  {
    meterId: 'FM-SAB-INLET-01',
    dmaId: 'DMA-SABAIL-01',
    role: 'INLET',
    name: 'Səbail Giriş Sayğacı (İçərişəhər)',
    minNormalValue: 10,
    maxNormalValue: 450,
    isActive: true,
    boundDeviceId: 'GW-SAB-01',
    allowedMetrics: ['FLOW_M3H'],
    canonicalUnit: 'm3/h',
  },
  {
    meterId: 'FM-SAB-OUTLET-01',
    dmaId: 'DMA-SABAIL-01',
    role: 'OUTLET',
    name: 'Səbail Çıxış Sayğacı (Sahil)',
    minNormalValue: 0,
    maxNormalValue: 350,
    isActive: true,
    boundDeviceId: 'GW-SAB-01',
    allowedMetrics: ['FLOW_M3H'],
    canonicalUnit: 'm3/h',
  },
];

export class StandardMeterRegistry implements MeterRegistry {
  private meters = new Map<string, MeterDefinition>();

  constructor(seedMeters: MeterDefinition[] = INITIAL_METERS) {
    for (const m of seedMeters) {
      this.meters.set(m.meterId, {
        ...m,
        allowedMetrics: m.allowedMetrics ? [...m.allowedMetrics] : undefined,
      });
    }
  }

  getMeter(meterId: string): MeterDefinition | undefined {
    const found = this.meters.get(meterId);
    return found
      ? { ...found, allowedMetrics: found.allowedMetrics ? [...found.allowedMetrics] : undefined }
      : undefined;
  }

  getMetersForDma(dmaId: string): MeterDefinition[] {
    return Array.from(this.meters.values())
      .filter((m) => m.dmaId === dmaId)
      .map((m) => ({
        ...m,
        allowedMetrics: m.allowedMetrics ? [...m.allowedMetrics] : undefined,
      }));
  }

  getAllMeters(): MeterDefinition[] {
    return Array.from(this.meters.values()).map((m) => ({
      ...m,
      allowedMetrics: m.allowedMetrics ? [...m.allowedMetrics] : undefined,
    }));
  }
}
