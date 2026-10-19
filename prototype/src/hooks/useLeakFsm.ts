import { useState, useCallback } from 'react';
import type { FsmStateDef, AuditLogEntry } from '../types';

export const FSM_STATES: FsmStateDef[] = [
  {
    id: 'DETECTED',
    nameAz: '1. Aşkarlanma (Detected)',
    nameEn: '1. Detected',
    invariants: 'Q_leak > 3.0 * sigma_flow; ΔP_wavefront < -0.6 bar. Sızma həcmi təcili qeydiyyata alınır.',
    allowedEvents: ['Briqada təyin et'],
  },
  {
    id: 'ASSIGNED',
    nameAz: '2. Təyinat (Assigned)',
    nameEn: '2. Assigned',
    invariants: 'WorkOrder.crew != null; GPS koordinatları təsdiqlənib; Briqada yoldadır (ETA < 45 dəq).',
    allowedEvents: ['Təmir aktını qeyd et'],
  },
  {
    id: 'REPAIRED',
    nameAz: '3. Təmir (Repaired)',
    nameEn: '3. Repaired',
    invariants: 'Klemma bərkidilib; Akustik səs-küy < 18 dB; Şəbəkə təzyiqi nominal həddə qaldırılıb.',
    allowedEvents: ['Hidravlik təsdiqləmə apar'],
  },
  {
    id: 'VERIFIED',
    nameAz: '4. Təsdiq (Verified)',
    nameEn: '4. Verified',
    invariants: '15 dəqiqəlik kütlə balansı ilkin MNF bazasına qayıtdı (Q <= 1.05 * Q_base). İnsident arxivləndi.',
    allowedEvents: ['Yeni dövrə başla'],
  },
];

export function useLeakFsm() {
  const [currentStateIndex, setCurrentStateIndex] = useState<number>(1);
  const [transitionLogs, setTransitionLogs] = useState<AuditLogEntry[]>([
    {
      id: 'log-1',
      timestamp: '14:02:11',
      level: 'WARN',
      message: 'FSM keçidi: Aşkarlanma -> Təyinat. İş əmri #WO-2026-0881 yaradıldı. Bakı-Mərkəz briqadası təyin olundu.',
    },
    {
      id: 'log-2',
      timestamp: '13:58:45',
      level: 'INFO',
      message: 'FSM invariant yoxlanışı: Yasamal DMA-04 hidravlik anomaliyası (38.4 m³/saat) qeydə alındı.',
    },
  ]);

  const currentState = FSM_STATES[currentStateIndex];

  const stepForward = useCallback(() => {
    setCurrentStateIndex((prev) => {
      const nextIndex = (prev + 1) % FSM_STATES.length;
      const nextState = FSM_STATES[nextIndex];
      const prevState = FSM_STATES[prev];

      const newLog: AuditLogEntry = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('az-AZ'),
        level: nextIndex === 3 ? 'SUCCESS' : 'INFO',
        message: `FSM keçidi: ${prevState.nameEn} -> ${nextState.nameEn}. Qoruyucu invariant yoxlanıldı: [${nextState.invariants.split(';')[0]}]`,
      };

      setTransitionLogs((logs) => [newLog, ...logs.slice(0, 19)]);
      return nextIndex;
    });
  }, []);

  const resetFsm = useCallback(() => {
    setCurrentStateIndex(0);
    const newLog: AuditLogEntry = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('az-AZ'),
      level: 'INFO',
      message: 'FSM sıfırlandı: İlkin vəziyyətə qayıtdı (Aşkarlanma).',
    };
    setTransitionLogs((logs) => [newLog, ...logs.slice(0, 19)]);
  }, []);

  return {
    currentState,
    currentStateIndex,
    allStates: FSM_STATES,
    transitionLogs,
    stepForward,
    resetFsm,
  };
}
