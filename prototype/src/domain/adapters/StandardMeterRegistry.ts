/**
 * Standard Meter Registry Fixture (Lectures 2 & 3: Information Hiding & Registry Pattern)
 * Defines known physical meters across pilot DMAs with explicit hydraulic roles.
 */

import type { MeterDefinition, MeterRegistry } from '../ports/TelemetryPort';

export const INITIAL_METERS: MeterDefinition[] = [
  // Yasamal DMA-04
  {
    meterId: 'FM-YAS-INLET-01',
    dmaId: 'DMA-YASAMAL-04',
    role: 'INLET',
    name: 'Yasamal Əsas Giriş Sayğacı (H. Cavid)',
    minNormalValue: 50,
    maxNormalValue: 600,
  },
  {
    meterId: 'FM-YAS-OUTLET-01',
    dmaId: 'DMA-YASAMAL-04',
    role: 'OUTLET',
    name: 'Yasamal Tranzit Çıxış Sayğacı (B. Vahabzadə)',
    minNormalValue: 20,
    maxNormalValue: 400,
  },
  {
    meterId: 'PT-YAS-PRESSURE-01',
    dmaId: 'DMA-YASAMAL-04',
    role: 'PRESSURE_MONITOR',
    name: 'Yasamal Təzyiq Transdüseri (Kritik Qovşaq)',
    minNormalValue: 1.5,
    maxNormalValue: 8.0,
  },

  // Nəsimi DMA-02
  {
    meterId: 'FM-NAS-INLET-01',
    dmaId: 'DMA-NASIMI-02',
    role: 'INLET',
    name: 'Nəsimi Giriş Sayğacı (28 May)',
    minNormalValue: 80,
    maxNormalValue: 700,
  },
  {
    meterId: 'FM-NAS-OUTLET-01',
    dmaId: 'DMA-NASIMI-02',
    role: 'OUTLET',
    name: 'Nəsimi Çıxış Sayğacı (D. Əliyeva)',
    minNormalValue: 40,
    maxNormalValue: 500,
  },
  {
    meterId: 'PT-NAS-PRESSURE-01',
    dmaId: 'DMA-NASIMI-02',
    role: 'PRESSURE_MONITOR',
    name: 'Nəsimi Təzyiq Sensoru',
    minNormalValue: 1.5,
    maxNormalValue: 7.0,
  },

  // Nizami DMA-07
  {
    meterId: 'FM-NIZ-INLET-01',
    dmaId: 'DMA-NIZAMI-07',
    role: 'INLET',
    name: 'Nizami Giriş Sayğacı (Q. Qarayev)',
    minNormalValue: 100,
    maxNormalValue: 800,
  },
  {
    meterId: 'FM-NIZ-OUTLET-01',
    dmaId: 'DMA-NIZAMI-07',
    role: 'OUTLET',
    name: 'Nizami Çıxış Sayğacı (Neftçilər)',
    minNormalValue: 80,
    maxNormalValue: 700,
  },

  // Səbail DMA-01
  {
    meterId: 'FM-SAB-INLET-01',
    dmaId: 'DMA-SABAIL-01',
    role: 'INLET',
    name: 'Səbail Giriş Sayğacı (İçərişəhər)',
    minNormalValue: 30,
    maxNormalValue: 450,
  },
  {
    meterId: 'FM-SAB-OUTLET-01',
    dmaId: 'DMA-SABAIL-01',
    role: 'OUTLET',
    name: 'Səbail Çıxış Sayğacı (Sahil)',
    minNormalValue: 20,
    maxNormalValue: 350,
  },
];

export class StandardMeterRegistry implements MeterRegistry {
  private meters = new Map<string, MeterDefinition>();

  constructor(seedMeters: MeterDefinition[] = INITIAL_METERS) {
    for (const m of seedMeters) {
      this.meters.set(m.meterId, m);
    }
  }

  getMeter(meterId: string): MeterDefinition | undefined {
    return this.meters.get(meterId);
  }

  getMetersForDma(dmaId: string): MeterDefinition[] {
    return Array.from(this.meters.values()).filter((m) => m.dmaId === dmaId);
  }

  getAllMeters(): MeterDefinition[] {
    return Array.from(this.meters.values());
  }
}
