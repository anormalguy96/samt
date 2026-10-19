import { useState, useCallback } from 'react';
import type { WorkOrder } from '../types';

const initialWorkOrders: WorkOrder[] = [
  {
    id: 'WO-2026-0881',
    dma: 'Yasamal DMA-04 (H. Cavid prospekti)',
    time: '14:02:11',
    loss: '38.4 m³/saat',
    cost: '15.36 AZN/saat',
    status: 'ASSIGNED',
    crew: 'Bakı Qəza-Bərpa Briqadası #3',
    crewRole: 'Baş Mühəndis: Kamran Əliyev',
    crewPhone: '+994 50 234-56-78',
    eta: '18 dəqiqə',
    coordinates: '40.3752° N, 49.8152° E',
    method: 'Acoustic Correlation (GSE-5000) & Ground Mic',
    acousticFreq: '142 Hz (Kəskin metalik boru sızması)',
    pressureDrop: '-0.72 bar (Transient Wavefront)',
    stepIndex: 1,
  },
  {
    id: 'WO-2026-0879',
    dma: 'Nəsimi DMA-02 (28 May)',
    time: '11:15:40',
    loss: '19.2 m³/saat',
    cost: '7.68 AZN/saat',
    status: 'IN_PROGRESS',
    crew: 'Bakı Qəza-Bərpa Briqadası #1',
    crewRole: 'Usta: Rəşad Məmmədov',
    crewPhone: '+994 55 876-54-32',
    eta: 'Ərazidədir (Qazıntı aparılır)',
    coordinates: '40.3798° N, 49.8489° E',
    method: 'Step Testing & Acoustic Listening Rod',
    acousticFreq: '88 Hz',
    pressureDrop: '-0.35 bar',
    stepIndex: 2,
  },
  {
    id: 'WO-2026-0874',
    dma: 'Səbail DMA-01 (İçərişəhər)',
    time: '08:42:00',
    loss: '8.5 m³/saat',
    cost: '3.40 AZN/saat',
    status: 'REPAIRED',
    crew: 'Tarixi Şəbəkə Xüsusi Briqadası',
    crewRole: 'Mühəndis: Elvin Qasımov',
    crewPhone: '+994 70 333-22-11',
    eta: 'Təmir tamamlandı',
    coordinates: '40.3662° N, 49.8350° E',
    method: 'Kompozit Klemma Quraşdırılması (Ø150mm)',
    acousticFreq: '< 18 Hz (Normallaşıb)',
    pressureDrop: '+0.40 bar (Bərpa olundu)',
    stepIndex: 3,
  },
  {
    id: 'WO-2026-0869',
    dma: 'Xətai DMA-03 (Əhmədli)',
    time: 'Dünən 23:10',
    loss: '0.0 m³/saat',
    cost: '0.00 AZN/saat',
    status: 'VERIFIED',
    crew: 'Keyfiyyət Nəzarət Mühəndisi',
    crewRole: 'Müfəttiş: Zaur Babayev',
    crewPhone: '+994 12 437-00-00',
    eta: 'Arxivləndi',
    coordinates: '40.3840° N, 49.9520° E',
    method: '15-min Post-Repair Continuous Aggregate Verification',
    acousticFreq: 'Fiziki itki tam dayandırılıb',
    pressureDrop: 'Nominal 4.2 bar',
    stepIndex: 4,
  },
];

export function useWorkOrders() {
  const [orders, setOrders] = useState<WorkOrder[]>(initialWorkOrders);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const openOrderModal = useCallback((order: WorkOrder) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
  }, []);

  const closeOrderModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const advanceOrderStatus = useCallback((orderId: string) => {
    const statuses: WorkOrder['status'][] = ['DISPATCHED', 'IN_PROGRESS', 'REPAIRED', 'VERIFIED'];
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const currentIdx = statuses.indexOf(order.status);
        const nextIdx = Math.min(statuses.length - 1, currentIdx + 1);
        const nextStatus = statuses[nextIdx];
        const updated = {
          ...order,
          status: nextStatus,
          stepIndex: nextIdx + 1,
        };
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(updated);
        }
        return updated;
      })
    );
  }, [selectedOrder]);

  return {
    orders,
    selectedOrder,
    isModalOpen,
    openOrderModal,
    closeOrderModal,
    advanceOrderStatus,
  };
}
