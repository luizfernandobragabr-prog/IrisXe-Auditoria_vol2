import {
  CorrelationPairResult,
  HwinfoSensorRow,
  PresentMonFrameRow,
  SynchronizedTelemetryPoint,
} from './types';

function meanNullable(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length === 0) return null;
  const sum = valid.reduce((a, b) => a + b, 0);
  return Number((sum / valid.length).toFixed(3));
}

export function computePercentile(sortedAsc: number[], percentile0to100: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (percentile0to100 / 100) * (sortedAsc.length - 1);
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sortedAsc[base + 1] !== undefined ? sortedAsc[base + 1] : sortedAsc[base];
  return Number((sortedAsc[base] + rest * (next - sortedAsc[base])).toFixed(3));
}

export function synchronizeTelemetryStreams(
  presentMonFrames: PresentMonFrameRow[],
  hwinfoSamples: HwinfoSensorRow[],
  options: {
    windowStepSeconds?: number;
    maxHwinfoDeltaSeconds?: number;
    monitorRefreshHz?: number;
  } = {}
): SynchronizedTelemetryPoint[] {
  const windowStep = options.windowStepSeconds ?? 0.5;
  const maxDelta = options.maxHwinfoDeltaSeconds ?? 1.25;
  const monitorPeriodMs = 1000 / (options.monitorRefreshHz ?? 100);

  if (presentMonFrames.length === 0 && hwinfoSamples.length === 0) {
    return [];
  }

  const minTimePm = presentMonFrames.length > 0 ? presentMonFrames[0].timeInSeconds : Infinity;
  const maxTimePm =
    presentMonFrames.length > 0
      ? presentMonFrames[presentMonFrames.length - 1].timeInSeconds
      : -Infinity;

  const minTimeHw = hwinfoSamples.length > 0 ? hwinfoSamples[0].timeInSeconds : Infinity;
  const maxTimeHw =
    hwinfoSamples.length > 0 ? hwinfoSamples[hwinfoSamples.length - 1].timeInSeconds : -Infinity;

  const startTime = Math.min(minTimePm, minTimeHw);
  const endTime = Math.max(maxTimePm, maxTimeHw);

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    return [];
  }

  const points: SynchronizedTelemetryPoint[] = [];
  const halfWin = windowStep / 2;

  // Build time grid
  const totalSteps = Math.max(1, Math.min(600, Math.ceil((endTime - startTime) / windowStep) + 1));

  let pmCursor = 0;
  for (let stepIdx = 0; stepIdx < totalSteps; stepIdx++) {
    const centerTime = Number((startTime + stepIdx * windowStep).toFixed(3));
    const winStart = centerTime - halfWin;
    const winEnd = centerTime + halfWin;

    // Collect PresentMon frames inside [winStart, winEnd]
    while (
      pmCursor < presentMonFrames.length &&
      presentMonFrames[pmCursor].timeInSeconds < winStart
    ) {
      pmCursor++;
    }

    const windowFrames: PresentMonFrameRow[] = [];
    let scanIdx = pmCursor;
    while (
      scanIdx < presentMonFrames.length &&
      presentMonFrames[scanIdx].timeInSeconds <= winEnd
    ) {
      windowFrames.push(presentMonFrames[scanIdx]);
      scanIdx++;
    }

    // Find nearest HWiNFO sample within maxDelta
    let nearestHw: HwinfoSensorRow | null = null;
    let bestDelta = Infinity;
    for (const hw of hwinfoSamples) {
      const delta = Math.abs(hw.timeInSeconds - centerTime);
      if (delta < bestDelta) {
        bestDelta = delta;
        nearestHw = hw;
      }
    }
    if (bestDelta > maxDelta) {
      nearestHw = null;
    }

    const hasPm = windowFrames.length > 0;
    const hasHw = nearestHw !== null;

    if (!hasPm && !hasHw) continue;

    const validFt = windowFrames
      .map((f) => f.msBetweenPresents)
      .filter((v): v is number => v !== null && v > 0)
      .sort((a, b) => a - b);

    const meanFt = meanNullable(validFt);
    const p99Ft = computePercentile(validFt, 99);
    const meanDispChange = meanNullable(windowFrames.map((f) => f.msBetweenDisplayChange));
    const fpsInstant = meanFt !== null && meanFt > 0 ? Number((1000 / meanFt).toFixed(1)) : null;
    const displayedFpsInstant =
      meanDispChange !== null && meanDispChange > 0
        ? Number((1000 / meanDispChange).toFixed(1))
        : null;

    const droppedFramesCount = windowFrames.filter((f) => f.dropped === true).length;
    const repeatedFramesCount = windowFrames.filter(
      (f) => f.msBetweenDisplayChange !== null && f.msBetweenDisplayChange >= monitorPeriodMs * 1.85
    ).length;

    const sampleFrame = windowFrames[0] ?? null;
    const syncInterval = sampleFrame ? sampleFrame.syncInterval : null;
    const allowsTearing = sampleFrame ? sampleFrame.allowsTearing : null;
    const presentMode = sampleFrame ? sampleFrame.presentMode : null;

    // Tearing risk is active when SyncInterval === 0 and frame time is not synchronized with scanout period
    const tearingRiskActive =
      hasPm &&
      (syncInterval === 0 || allowsTearing === true) &&
      meanFt !== null &&
      Math.abs((meanFt % monitorPeriodMs)) > 0.35;

    const stutterEventActive =
      p99Ft !== null && meanFt !== null && (p99Ft > 22.0 || p99Ft > meanFt * 2.1);

    const timestampUtc =
      sampleFrame?.timestampUtc ??
      nearestHw?.timestampUtc ??
      new Date(Date.UTC(2026, 2, 15, 18, 0, 0) + Math.round(centerTime * 1000)).toISOString();

    points.push({
      windowIndex: points.length,
      timeSeconds: centerTime,
      timestampUtc,
      sourcePresentMon: hasPm ? 'PresentMon CSV (agregado por janela temporal)' : 'Ausente nesta janela',
      sourceHwinfo: hasHw ? 'HWiNFO64 CSV (alinhado por vizinho temporal)' : 'Ausente nesta janela',
      isSimulated:
        (sampleFrame?.isSimulated ?? false) || (nearestHw?.isSimulated ?? false),
      temporalDeltaMs: hasHw && hasPm ? Number((bestDelta * 1000).toFixed(1)) : null,
      hasPresentMonData: hasPm,
      hasHwinfoData: hasHw,
      fpsInstant,
      displayedFpsInstant,
      frametimeMs: meanFt,
      frametimeP99WindowMs: p99Ft,
      msBetweenDisplayChange: meanDispChange,
      msUntilDisplayed: meanNullable(windowFrames.map((f) => f.msUntilDisplayed)),
      msInPresentApi: meanNullable(windowFrames.map((f) => f.msInPresentApi)),
      cpuBusyMs: meanNullable(windowFrames.map((f) => f.cpuBusyMs)),
      cpuWaitMs: meanNullable(windowFrames.map((f) => f.cpuWaitMs)),
      gpuBusyMs: meanNullable(windowFrames.map((f) => f.gpuBusyMs)),
      gpuWaitMs: meanNullable(windowFrames.map((f) => f.gpuWaitMs)),
      presentMode,
      syncInterval,
      allowsTearing,
      droppedFramesCount,
      repeatedFramesCount,
      tearingRiskActive,
      stutterEventActive,
      gpuClockMhz: nearestHw?.gpuClockMhz ?? null,
      gpuUsagePct: nearestHw?.gpuUsagePct ?? null,
      gpu3dEnginePct: nearestHw?.gpu3dEnginePct ?? null,
      gpuCopyEnginePct: nearestHw?.gpuCopyEnginePct ?? null,
      gpuVideoEnginePct: nearestHw?.gpuVideoEnginePct ?? null,
      gpuPowerW: nearestHw?.gpuPowerW ?? null,
      gpuTempC: nearestHw?.gpuTempC ?? null,
      cpuUsageTotalPct: nearestHw?.cpuUsageTotalPct ?? null,
      cpuMaxThreadUsagePct: nearestHw?.cpuMaxThreadUsagePct ?? null,
      cpuNominalClockMhz: nearestHw?.cpuNominalClockMhz ?? null,
      cpuEffectiveClockMhz: nearestHw?.cpuEffectiveClockMhz ?? null,
      cpuTempC: nearestHw?.cpuTempC ?? null,
      cpuPackagePowerW: nearestHw?.cpuPackagePowerW ?? null,
      cpuPl1W: nearestHw?.cpuPl1W ?? null,
      cpuPl2W: nearestHw?.cpuPl2W ?? null,
      cpuThermalThrottling: nearestHw?.cpuThermalThrottling ?? null,
      cpuPowerLimitThrottling: nearestHw?.cpuPowerLimitThrottling ?? null,
      cpuProchotActive: nearestHw?.cpuProchotActive ?? null,
      ramUsedMb: nearestHw?.ramUsedMb ?? null,
      ramLoadPct: nearestHw?.ramLoadPct ?? null,
      pageFileUsagePct: nearestHw?.pageFileUsagePct ?? null,
    });
  }

  return points;
}

export function computePearsonR(pairs: Array<[number, number]>): number | null {
  const n = pairs.length;
  if (n < 5) return null; // Insufficient samples for statistical correlation

  let sumX = 0;
  let sumY = 0;
  for (const [x, y] of pairs) {
    sumX += x;
    sumY += y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (const [x, y] of pairs) {
    const dx = x - meanX;
    const dy = y - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const denom = Math.sqrt(denX * denY);
  if (denom < 1e-9) return 0;
  return Number((num / denom).toFixed(3));
}

function describeCorrelationStrength(r: number | null): string {
  if (r === null) return 'Amostras insuficientes (n < 5)';
  const abs = Math.abs(r);
  const dir = r >= 0 ? 'positiva' : 'inversa (negativa)';
  if (abs >= 0.75) return `Forte correlação ${dir} (r = ${r})`;
  if (abs >= 0.45) return `Correlação moderada ${dir} (r = ${r})`;
  if (abs >= 0.2) return `Correlação fraca ${dir} (r = ${r})`;
  return `Sem correlação linear relevante (r = ${r})`;
}

export function computeTemporalCorrelations(
  stream: SynchronizedTelemetryPoint[]
): CorrelationPairResult[] {
  const extractPairs = (
    getterA: (p: SynchronizedTelemetryPoint) => number | null,
    getterB: (p: SynchronizedTelemetryPoint) => number | null
  ): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (const pt of stream) {
      const a = getterA(pt);
      const b = getterB(pt);
      if (a !== null && b !== null && Number.isFinite(a) && Number.isFinite(b)) {
        out.push([a, b]);
      }
    }
    return out;
  };

  const pairsCpuClockVsFrametime = extractPairs((p) => p.cpuEffectiveClockMhz, (p) => p.frametimeMs);
  const rCpuClockFt = computePearsonR(pairsCpuClockVsFrametime);

  const pairsGpuClockVsFrametime = extractPairs((p) => p.gpuClockMhz, (p) => p.frametimeMs);
  const rGpuClockFt = computePearsonR(pairsGpuClockVsFrametime);

  const pairsCpuTempVsCpuClock = extractPairs((p) => p.cpuTempC, (p) => p.cpuEffectiveClockMhz);
  const rTempClock = computePearsonR(pairsCpuTempVsCpuClock);

  const pairsPkgPowerVsGpuClock = extractPairs((p) => p.cpuPackagePowerW, (p) => p.gpuClockMhz);
  const rPowerGpu = computePearsonR(pairsPkgPowerVsGpuClock);

  const pairsGpuBusyVsFrametime = extractPairs((p) => p.gpuBusyMs, (p) => p.frametimeMs);
  const rGpuBusyFt = computePearsonR(pairsGpuBusyVsFrametime);

  const disclaimer =
    'A correlação estatística mede variação conjunta na janela temporal, mas NÃO prova causalidade isoladamente sem teste controlado A/B.';

  return [
    {
      id: 'corr-cpu-eff-clock-vs-frametime',
      metricA: 'Frequência Efetiva da CPU',
      metricB: 'Frametime Médio da Janela',
      unitA: 'MHz',
      unitB: 'ms',
      sampleCount: pairsCpuClockVsFrametime.length,
      pearsonR: rCpuClockFt,
      strengthLabel: describeCorrelationStrength(rCpuClockFt),
      technicalInterpretation:
        rCpuClockFt !== null && rCpuClockFt <= -0.45
          ? 'Quando a frequência efetiva da CPU cai (por limite térmico ou queda de PL2→PL1), o frametime sobe de forma sincronizada.'
          : 'Variações de frametime não acompanharam linearmente a frequência média da CPU nesta sessão.',
      causalityWarning: disclaimer,
    },
    {
      id: 'corr-gpu-clock-vs-frametime',
      metricA: 'Frequência da GPU Iris Xe',
      metricB: 'Frametime Médio da Janela',
      unitA: 'MHz',
      unitB: 'ms',
      sampleCount: pairsGpuClockVsFrametime.length,
      pearsonR: rGpuClockFt,
      strengthLabel: describeCorrelationStrength(rGpuClockFt),
      technicalInterpretation:
        rGpuClockFt !== null && rGpuClockFt <= -0.45
          ? 'Quedas na frequência da GPU Iris Xe coincidem com aumento no tempo de renderização dos quadros.'
          : 'A oscilação de clock da GPU ocorreu sem impacto linear proporcional no frametime (compatível com gargalo de CPU/thread principal ou limite de FPS).',
      causalityWarning: disclaimer,
    },
    {
      id: 'corr-cpu-temp-vs-cpu-clock',
      metricA: 'Temperatura do Package CPU',
      metricB: 'Frequência Efetiva da CPU',
      unitA: '°C',
      unitB: 'MHz',
      sampleCount: pairsCpuTempVsCpuClock.length,
      pearsonR: rTempClock,
      strengthLabel: describeCorrelationStrength(rTempClock),
      technicalInterpretation:
        rTempClock !== null && rTempClock <= -0.45
          ? 'A elevação térmica próxima ao limite de ativação do TCC correlaciona-se inversamente com o clock efetivo dos núcleos.'
          : 'A frequência da CPU variou por demanda de carga ou limite de potência (PL1) antes de sustentação térmica.',
      causalityWarning: disclaimer,
    },
    {
      id: 'corr-pkg-power-vs-gpu-clock',
      metricA: 'Potência do Package (CPU + Iris Xe)',
      metricB: 'Frequência da GPU Iris Xe',
      unitA: 'W',
      unitB: 'MHz',
      sampleCount: pairsPkgPowerVsGpuClock.length,
      pearsonR: rPowerGpu,
      strengthLabel: describeCorrelationStrength(rPowerGpu),
      technicalInterpretation:
        rPowerGpu !== null && Math.abs(rPowerGpu) >= 0.45
          ? 'Evidencia disputa pelo orçamento energético compartilhado do package Tiger Lake-U entre os 4 núcleos Willow Cove e as 96 EUs da Iris Xe.'
          : 'Frequência da GPU operou sem correlação direta com o teto instantâneo de potência do package.',
      causalityWarning: disclaimer,
    },
    {
      id: 'corr-gpu-busy-vs-frametime',
      metricA: 'GPU Busy (Tempo Ativo de Renderização)',
      metricB: 'Frametime Total',
      unitA: 'ms',
      unitB: 'ms',
      sampleCount: pairsGpuBusyVsFrametime.length,
      pearsonR: rGpuBusyFt,
      strengthLabel: describeCorrelationStrength(rGpuBusyFt),
      technicalInterpretation:
        rGpuBusyFt !== null && rGpuBusyFt >= 0.6
          ? 'O frametime acompanha diretamente o tempo ocupado da GPU (GPU-bound nos picos).'
          : 'Os picos de frametime ocorrem mesmo com GPU Busy baixo (GPU Wait elevado), indicando que a GPU Iris Xe aguarda a CPU submeter trabalho.',
      causalityWarning: disclaimer,
    },
  ];
}
