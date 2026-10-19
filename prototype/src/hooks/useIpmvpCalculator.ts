import { useState, useMemo } from 'react';

export function useIpmvpCalculator() {
  const [baselineFlowM3h, setBaselineFlowM3h] = useState<number>(104.2);
  const [postRepairFlowM3h, setPostRepairFlowM3h] = useState<number>(76.5);
  const [pressureBar, setPressureBar] = useState<number>(4.2);
  const [waterTariffAznM3] = useState<number>(0.40); // Standard official tariff

  const results = useMemo(() => {
    const hourlySavingM3 = Math.max(0, baselineFlowM3h - postRepairFlowM3h);
    const dailySavingM3 = hourlySavingM3 * 24;
    const dailySavingAzn = dailySavingM3 * waterTariffAznM3;
    const annualSavingM3 = dailySavingM3 * 365;
    const annualSavingAzn = dailySavingAzn * 365;

    // Torricelli pressure correction: Q_leak ~ sqrt(P)
    const normalizedLeakIndex = (hourlySavingM3 / Math.sqrt(Math.max(1, pressureBar))).toFixed(2);

    return {
      hourlySavingM3: hourlySavingM3.toFixed(1),
      dailySavingM3: dailySavingM3.toFixed(1),
      dailySavingAzn: dailySavingAzn.toFixed(2),
      annualSavingM3: Math.round(annualSavingM3).toLocaleString('az-AZ'),
      annualSavingAzn: Math.round(annualSavingAzn).toLocaleString('az-AZ'),
      normalizedLeakIndex,
    };
  }, [baselineFlowM3h, postRepairFlowM3h, pressureBar, waterTariffAznM3]);

  return {
    baselineFlowM3h,
    postRepairFlowM3h,
    pressureBar,
    waterTariffAznM3,
    results,
    setBaselineFlowM3h,
    setPostRepairFlowM3h,
    setPressureBar,
  };
}
