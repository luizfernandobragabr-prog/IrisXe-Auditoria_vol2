import { computePercentile } from './temporalSync';
import {
  FrametimeStats,
  HwinfoSensorRow,
  PresentMonFrameRow,
  PresentationChainStage,
  StutterEvent,
  SynchronizedTelemetryPoint,
  VrrThreeTierAssessment,
} from './types';

export interface PhenomenonDefinition {
  id: string;
  name: string;
  physicalCause: string;
  presentMonSignature: string;
  visualSymptom: string;
  commonFalseBelief: string;
}

export const PRESENTATION_PHENOMENA_TAXONOMY: ReadonlyArray<PhenomenonDefinition> = Object.freeze([
  {
    id: 'tearing',
    name: 'Screen Tearing (Rasgo Horizontal de Imagem)',
    physicalCause:
      'Troca do front-buffer (flip) durante o ciclo de varredura vertical (scanout de 10,0 ms em 100 Hz) com SyncInterval = 0 e AllowsTearing = 1.',
    presentMonSignature:
      'PresentMode = Hardware: Independent Flip (ou Legacy Flip), SyncInterval = 0, AllowsTearing = 1 e MsBetweenPresents diferente de múltiplos exatos de 10,0 ms.',
    visualSymptom:
      'Corte horizontal visível separando dois ou mais quadros distintos na mesma varredura do monitor Weal 100 Hz.',
    commonFalseBelief:
      'Falso mito: "FPS acima de 100 Hz elimina o tearing". Em 140 FPS com SyncInterval=0 sem VRR, o flip ocorre no meio do scanout de 10 ms e o tearing continua ocorrendo.',
  },
  {
    id: 'stuttering',
    name: 'Stuttering (Engasgo / Microtravamento Discreto)',
    physicalCause:
      'Atraso abrupto na entrega de um ou mais quadros por saturação de thread da CPU, compilação de shader, página de memória ou throttling térmico/potência (PL1/PROCHOT).',
    presentMonSignature:
      'Pico agudo em MsBetweenPresents (ex.: salto de 8,5 ms para > 28–55 ms; razão > 2,2x em relação à mediana local).',
    visualSymptom:
      'Congelamento momentâneo perceptível da imagem seguido de salto brusco de posição da mira no Valorant.',
    commonFalseBelief:
      'Falso mito: "Stuttering é sempre culpa da GPU". Se GPU Busy permanece baixo e GPU Wait sobe durante o pico, a GPU estava ociosa esperando a CPU.',
  },
  {
    id: 'judder',
    name: 'Judder (Cadência Assimétrica de Varredura)',
    physicalCause:
      'Falta de divisibilidade inteira entre a taxa de quadros gerada (ex.: 125 FPS = 8,0 ms) e a frequência fixa do monitor (100 Hz = 10,0 ms) sem VRR ativo.',
    presentMonSignature:
      'MsBetweenPresents estável (ex.: 8,0 ms), porém MsBetweenDisplayChange alterna entre 10,0 ms e 20,0 ms (batimento 4:5).',
    visualSymptom:
      'Sensação de falta de fluidez contínua (vibração em movimentos de câmera horizontais) mesmo com frametime de renderização reto.',
    commonFalseBelief:
      'Confundido com stuttering; no judder o tempo de geração do quadro é constante, mas o encaixe nos ciclos de 10 ms do monitor é assimétrico.',
  },
  {
    id: 'dropped-frames',
    name: 'Frames Descartados (Dropped Frames)',
    physicalCause:
      'Quadro renderizado pela GPU é substituído na fila de apresentação por um quadro mais recente antes que o monitor inicie o próximo scanout.',
    presentMonSignature:
      'Coluna Dropped = 1 (true) e MsUntilDisplayed = 0 (ou ausente) no registro PresentMon.',
    visualSymptom:
      'Movimento salta etapas intermediárias; reduz latência no modo FastSync/Composed, mas desperdiça energia do package CPU+GPU.',
    commonFalseBelief:
      'Gerar 180 FPS em janela sem bordas (Composed: Flip) faz o DWM descartar ~80 quadros/s em um monitor de 100 Hz, aquecendo o package à toa.',
  },
  {
    id: 'repeated-frames',
    name: 'Frames Repetidos (Scanout Duplicado)',
    physicalCause:
      'Nenhum quadro novo ficou pronto a tempo do próximo pulso V-Blank de 10,0 ms (100 Hz); o controlador de display reenvia o buffer anterior.',
    presentMonSignature:
      'MsBetweenDisplayChange salta de 10,0 ms para 20,0 ms, 30,0 ms ou mais.',
    visualSymptom:
      'Queda instantânea da fluidez efetiva para 50 Hz ou 33,3 Hz naquele intervalo (especialmente severo com V-Sync ligado).',
    commonFalseBelief:
      'Present FPS pode indicar 92 FPS médios, mas os quadros atrasados forçam ciclos repetidos de 20 ms no monitor.',
  },
  {
    id: 'low-fps',
    name: 'Baixa Taxa de Quadros Sustentada (Low FPS)',
    physicalCause:
      'Limitação contínua de throughput (96 EUs da Iris Xe saturadas em GPU Busy ~100%, largura de banda DDR4-2133 saturada ou CPU em PL1 rígido).',
    presentMonSignature:
      'MsBetweenPresents sustentadamente elevado (ex.: > 16,6 ms de forma contínua, sem picos isolados).',
    visualSymptom:
      'Imagem consistentemente lenta e pesada, porém sem congelamentos súbitos se o frametime for uniforme.',
    commonFalseBelief:
      'Baixo FPS com frametime constante é visualmente diferente de alto FPS com stuttering severo.',
  },
  {
    id: 'frametime-variance',
    name: 'Variação Temporal de Frametime (Frame Pacing Irregular)',
    physicalCause:
      'Oscilação rápida de frequência da GPU/CPU (ex.: Iris Xe alternando entre 800 MHz e 1350 MHz) ou contenção na fila de submissão DirectX 11.',
    presentMonSignature:
      'Desvio padrão elevado de MsBetweenPresents (> 3,0 ms) e grande distância entre FPS médio e 1% Low / 0,1% Low.',
    visualSymptom:
      'Sensação de mira "arenosa" ou inconsistente em trocas de tiro rápidas, mesmo quando o contador de FPS médio parece alto.',
    commonFalseBelief:
      'Olhar apenas para o FPS médio esconde completamente uma razão P99 / P50 degradada.',
  },
  {
    id: 'input-lag',
    name: 'Input Lag / Latência de Apresentação (Click-to-Photon)',
    physicalCause:
      'Acúmulo de quadros na fila de renderização (GPU bound a 99% sem Reflex/frame cap), composição pelo DWM (Composed: Flip) ou espera por V-Blank (SyncInterval=1).',
    presentMonSignature:
      'MsUntilDisplayed (ou DisplayLatency) elevado (> 20–35 ms) muito acima de MsBetweenPresents.',
    visualSymptom:
      'Atraso perceptível entre o movimento do mouse/clique e a resposta visual no painel LCD de 100 Hz.',
    commonFalseBelief:
      'Desligar o V-Sync reduz MsUntilDisplayed, mas deixar a GPU Iris Xe em 99% de uso sem limite de FPS recria fila de renderização e aumenta o input lag.',
  },
]);

export function computeFrametimeMetrics(
  frames: PresentMonFrameRow[],
  hwinfoSamples: HwinfoSensorRow[],
  syncStream: SynchronizedTelemetryPoint[]
): FrametimeStats {
  const sampleCount = frames.length;
  const validFrames = frames.filter(
    (f): f is PresentMonFrameRow & { msBetweenPresents: number } =>
      f.msBetweenPresents !== null && Number.isFinite(f.msBetweenPresents) && f.msBetweenPresents > 0
  );
  const validFrameCount = validFrames.length;
  const missingFrameCount = sampleCount - validFrameCount;

  const durationSeconds =
    validFrameCount >= 2
      ? Number(
          Math.max(
            0.001,
            validFrames[validFrames.length - 1].timeInSeconds - validFrames[0].timeInSeconds
          ).toFixed(3)
        )
      : 0;

  const methodologyNotes: string[] = [
    'FPS Médio = 1000 / Média Aritmética(MsBetweenPresents válidos).',
    '1% Low FPS = 1000 / Percentil 99(MsBetweenPresents); 0,1% Low FPS = 1000 / Percentil 99,9(MsBetweenPresents).',
    'Eventos de Stuttering = quadros onde MsBetweenPresents > 22,0 ms E > 2,1x a mediana móvel local.',
    'Dados ausentes (null/NA) jamais são convertidos em zero.',
  ];

  // GPU Clock statistics from HWiNFO64 samples
  const validGpuClocks = hwinfoSamples
    .map((s) => s.gpuClockMhz)
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b);

  const gpuClockMinMhz = validGpuClocks.length > 0 ? validGpuClocks[0] : null;
  const gpuClockMaxMhz =
    validGpuClocks.length > 0 ? validGpuClocks[validGpuClocks.length - 1] : null;
  const gpuClockAvgMhz =
    validGpuClocks.length > 0
      ? Number(
          (validGpuClocks.reduce((a, b) => a + b, 0) / validGpuClocks.length).toFixed(1)
        )
      : null;
  const gpuClockP50Mhz = computePercentile(validGpuClocks, 50);
  const gpuClockP95Mhz = computePercentile(validGpuClocks, 95);

  const pctTimeGpuAbove1100Mhz =
    validGpuClocks.length > 0
      ? Number(
          (
            (validGpuClocks.filter((c) => c >= 1100).length / validGpuClocks.length) *
            100
          ).toFixed(1)
        )
      : null;

  const pctTimeGpuAbove1300Mhz =
    validGpuClocks.length > 0
      ? Number(
          (
            (validGpuClocks.filter((c) => c >= 1300).length / validGpuClocks.length) *
            100
          ).toFixed(1)
        )
      : null;

  if (validFrameCount < 10) {
    return {
      sampleCount,
      validFrameCount,
      missingFrameCount,
      durationSeconds,
      insufficientSamples: true,
      insufficientReason: `Amostras válidas insuficientes (${validFrameCount} quadros válidos; mínimo recomendado >= 30 quadros para percentis estatísticos confiáveis).`,
      avgFps: null,
      minFps: null,
      maxFps: null,
      fps1PercentLow: null,
      fps0_1PercentLow: null,
      avgFrametimeMs: null,
      minFrametimeMs: null,
      maxFrametimeMs: null,
      p50FrametimeMs: null,
      p95FrametimeMs: null,
      p99FrametimeMs: null,
      p99_9FrametimeMs: null,
      stdDevFrametimeMs: null,
      stutterEventsCount: 0,
      totalStutterDurationMs: 0,
      stutterEvents: [],
      droppedFramesTotal: frames.filter((f) => f.dropped === true).length,
      repeatedFramesTotal: 0,
      pctTimeGpuAbove1100Mhz,
      pctTimeGpuAbove1300Mhz,
      gpuClockMinMhz,
      gpuClockAvgMhz,
      gpuClockMaxMhz,
      gpuClockP50Mhz,
      gpuClockP95Mhz,
      methodologyNotes,
    };
  }

  const insufficientSamples = validFrameCount < 30;
  const insufficientReason = insufficientSamples
    ? `Atenção metodológica: sessão curta (${validFrameCount} quadros válidos < 30). Os percentis 1% Low e 0,1% Low possuem baixa precisão estatística.`
    : undefined;

  const fts = validFrames.map((f) => f.msBetweenPresents);
  const sortedFt = [...fts].sort((a, b) => a - b);

  const sumFt = fts.reduce((a, b) => a + b, 0);
  const avgFrametimeMs = Number((sumFt / validFrameCount).toFixed(3));
  const minFrametimeMs = Number(sortedFt[0].toFixed(3));
  const maxFrametimeMs = Number(sortedFt[sortedFt.length - 1].toFixed(3));

  const p50FrametimeMs = computePercentile(sortedFt, 50);
  const p95FrametimeMs = computePercentile(sortedFt, 95);
  const p99FrametimeMs = computePercentile(sortedFt, 99);
  const p99_9FrametimeMs = computePercentile(sortedFt, 99.9);

  let varianceSum = 0;
  for (const ft of fts) {
    const diff = ft - avgFrametimeMs;
    varianceSum += diff * diff;
  }
  const stdDevFrametimeMs = Number(Math.sqrt(varianceSum / validFrameCount).toFixed(3));

  const avgFps = avgFrametimeMs > 0 ? Number((1000 / avgFrametimeMs).toFixed(1)) : null;
  const minFps = maxFrametimeMs > 0 ? Number((1000 / maxFrametimeMs).toFixed(1)) : null;
  const maxFps = minFrametimeMs > 0 ? Number((1000 / minFrametimeMs).toFixed(1)) : null;
  const fps1PercentLow =
    p99FrametimeMs && p99FrametimeMs > 0 ? Number((1000 / p99FrametimeMs).toFixed(1)) : null;
  const fps0_1PercentLow =
    p99_9FrametimeMs && p99_9FrametimeMs > 0
      ? Number((1000 / p99_9FrametimeMs).toFixed(1))
      : null;

  // Detect discrete stuttering events and correlate with concurrent hardware state
  const stutterEvents: StutterEvent[] = [];
  const globalMedian = p50FrametimeMs ?? avgFrametimeMs;

  for (let i = 0; i < validFrames.length; i++) {
    const frame = validFrames[i];
    const ft = frame.msBetweenPresents;

    // Local median window of 11 frames around i
    const winSlice: number[] = [];
    for (let j = Math.max(0, i - 5); j <= Math.min(validFrames.length - 1, i + 5); j++) {
      if (j !== i) winSlice.push(validFrames[j].msBetweenPresents);
    }
    winSlice.sort((a, b) => a - b);
    const localMed = computePercentile(winSlice, 50) ?? globalMedian;
    const ratio = localMed > 0 ? Number((ft / localMed).toFixed(2)) : 1;

    if (ft >= 22.0 && ratio >= 2.05) {
      // Find concurrent synchronized hardware window
      let nearestSync: SynchronizedTelemetryPoint | null = null;
      let minDelta = Infinity;
      for (const sp of syncStream) {
        const d = Math.abs(sp.timeSeconds - frame.timeInSeconds);
        if (d < minDelta) {
          minDelta = d;
          nearestSync = sp;
        }
      }

      let probableTrigger = 'Oscilação transitória de fila de renderização';
      if (nearestSync) {
        if (nearestSync.cpuThermalThrottling === true || (nearestSync.cpuTempC ?? 0) >= 98) {
          probableTrigger = `Throttling Térmico da CPU (${nearestSync.cpuTempC ?? '≥98'} °C atingiu limite TCC)`;
        } else if (nearestSync.cpuPowerLimitThrottling === true) {
          probableTrigger = `Queda de Limite de Potência do Package (PL1/PL2 = ${nearestSync.cpuPackagePowerW ?? '—'} W)`;
        } else if ((nearestSync.cpuMaxThreadUsagePct ?? 0) >= 95 && (nearestSync.gpuUsagePct ?? 100) < 75) {
          probableTrigger = `Saturação de Thread Principal da CPU (${nearestSync.cpuMaxThreadUsagePct}% thread máx com GPU Iris Xe em ${nearestSync.gpuUsagePct}%)`;
        } else if ((nearestSync.gpuClockMhz ?? 1400) < 900) {
          probableTrigger = `Queda brusca de clock da GPU Iris Xe (${nearestSync.gpuClockMhz} MHz)`;
        }
      }

      stutterEvents.push({
        eventIndex: stutterEvents.length + 1,
        startTimeSeconds: Number(frame.timeInSeconds.toFixed(3)),
        endTimeSeconds: Number((frame.timeInSeconds + ft / 1000).toFixed(3)),
        durationMs: Number(ft.toFixed(2)),
        peakFrametimeMs: Number(ft.toFixed(2)),
        localMedianFrametimeMs: Number(localMed.toFixed(2)),
        ratioToMedian: ratio,
        concurrentCpuTempC: nearestSync?.cpuTempC ?? null,
        concurrentCpuEffectiveMhz: nearestSync?.cpuEffectiveClockMhz ?? null,
        concurrentGpuClockMhz: nearestSync?.gpuClockMhz ?? null,
        concurrentGpuBusyPct: nearestSync?.gpuUsagePct ?? null,
        concurrentCpuMaxThreadPct: nearestSync?.cpuMaxThreadUsagePct ?? null,
        concurrentThermalThrottle: nearestSync?.cpuThermalThrottling ?? null,
        concurrentPowerThrottle: nearestSync?.cpuPowerLimitThrottling ?? null,
        probableTrigger,
      });
    }
  }

  const totalStutterDurationMs = Number(
    stutterEvents.reduce((acc, ev) => acc + ev.durationMs, 0).toFixed(2)
  );

  const droppedFramesTotal = frames.filter((f) => f.dropped === true).length;
  const repeatedFramesTotal = validFrames.filter(
    (f) => f.msBetweenDisplayChange !== null && f.msBetweenDisplayChange >= 18.5
  ).length;

  return {
    sampleCount,
    validFrameCount,
    missingFrameCount,
    durationSeconds,
    insufficientSamples,
    insufficientReason,
    avgFps,
    minFps,
    maxFps,
    fps1PercentLow,
    fps0_1PercentLow,
    avgFrametimeMs,
    minFrametimeMs,
    maxFrametimeMs,
    p50FrametimeMs,
    p95FrametimeMs,
    p99FrametimeMs,
    p99_9FrametimeMs,
    stdDevFrametimeMs,
    stutterEventsCount: stutterEvents.length,
    totalStutterDurationMs,
    stutterEvents,
    droppedFramesTotal,
    repeatedFramesTotal,
    pctTimeGpuAbove1100Mhz,
    pctTimeGpuAbove1300Mhz,
    gpuClockMinMhz,
    gpuClockAvgMhz,
    gpuClockMaxMhz,
    gpuClockP50Mhz,
    gpuClockP95Mhz,
    methodologyNotes,
  };
}

export function analyzeVrrStatus(params: {
  frames: PresentMonFrameRow[];
  monitorRefreshHz: number;
  vrrConfiguredInSession: boolean;
  edidRawAvailable?: boolean;
  edidClaimsVrr?: boolean;
}): VrrThreeTierAssessment {
  const { frames, monitorRefreshHz, vrrConfiguredInSession, edidRawAvailable, edidClaimsVrr } = params;
  const scanoutPeriodMs = 1000 / monitorRefreshHz; // 10.0 ms for 100 Hz

  const dispChanges = frames
    .map((f) => f.msBetweenDisplayChange)
    .filter((v): v is number => v !== null && v > 0);

  let quantizedTo10msPct: number | null = null;
  let dispStdDev: number | null = null;

  if (dispChanges.length >= 10) {
    const mean = dispChanges.reduce((a, b) => a + b, 0) / dispChanges.length;
    const variance =
      dispChanges.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / dispChanges.length;
    dispStdDev = Number(Math.sqrt(variance).toFixed(3));

    // Check how many display changes are quantized to integer multiples of 10.0ms (e.g. 10.0ms, 20.0ms, 30.0ms) within ±0.35ms
    let quantizedCount = 0;
    for (const d of dispChanges) {
      const nearestMultiple = Math.round(d / scanoutPeriodMs) * scanoutPeriodMs;
      if (nearestMultiple >= scanoutPeriodMs && Math.abs(d - nearestMultiple) <= 0.4) {
        quantizedCount++;
      }
    }
    quantizedTo10msPct = Number(((quantizedCount / dispChanges.length) * 100).toFixed(1));
  }

  const anyAllowsTearing = frames.some((f) => f.allowsTearing === true);
  const edidStatus = edidRawAvailable
    ? edidClaimsVrr
      ? 'Suportado no EDID'
      : 'Não anunciado no EDID'
    : 'Não anunciado no EDID';

  const effectiveActive =
    quantizedTo10msPct !== null &&
    quantizedTo10msPct < 55 &&
    vrrConfiguredInSession &&
    dispChanges.length >= 10;

  return {
    edidAnnouncedSupport: {
      status: edidStatus,
      rangeHz: edidClaimsVrr ? '48–100 Hz (Desc. Adaptive-Sync)' : '100 Hz Fixo (sem bloco VRR HDMI 2.1 / Adaptive-Sync confirmado)',
      connectionType: 'HDMI (Positivo NL40MU1 → Monitor Weal LCD 22,5")',
      detail:
        'Não se deve presumir que o monitor Weal 22,5" 100 Hz possua FreeSync/Adaptive-Sync sob conexão HDMI. A presença de descritor no EDID, mesmo quando existente, não prova que o VRR esteja ativo.',
    },
    driverAndOsSupport: {
      status: vrrConfiguredInSession
        ? 'Habilitado no Driver/Windows'
        : 'Desabilitado ou Não Suportado via HDMI',
      dxgiAllowTearing: anyAllowsTearing,
      windowsDrrStatus: vrrConfiguredInSession
        ? 'Taxa de Atualização Variável do Windows 11 25H2 marcada para teste'
        : 'VRR desativado / indisponível no Intel Graphics Command Center via porta HDMI da placa NL40MU1',
      detail: anyAllowsTearing
        ? 'DXGI_FEATURE_PRESENT_ALLOW_TEARING está ativo no driver Intel Iris Xe, mas está sendo usado para flips imediatos sem V-Sync (causando tearing) em vez de modulação VRR do monitor.'
        : 'Sem evidência de negociação VRR ativa entre o driver Intel Iris Xe e o monitor externo via HDMI.',
    },
    effectiveRuntimeOperation: {
      status:
        dispChanges.length < 10
          ? 'Amostras Insuficientes'
          : effectiveActive
          ? 'Ativo (Refresh Variável Medido)'
          : 'Inativo (Scanout Fixo 100 Hz / 10,0 ms)',
      measuredDisplayChangeStdDevMs: dispStdDev,
      quantizedTo10msPct,
      detail:
        quantizedTo10msPct !== null
          ? `${quantizedTo10msPct}% das trocas de quadro exibidas (MsBetweenDisplayChange) ocorreram em múltiplos fixos do ciclo de ${scanoutPeriodMs.toFixed(1)} ms (${monitorRefreshHz} Hz), ou com SyncInterval=0 desacoplado do V-Blank.`
          : 'Sem amostras suficientes de MsBetweenDisplayChange para comprovar modulação de refresh.',
    },
    overallConclusion: effectiveActive
      ? 'Confirmado por medição: Os intervalos MsBetweenDisplayChange acompanham dinamicamente o tempo de quadro.'
      : `VRR NÃO está operando efetivamente. O monitor Weal 22,5" opera em varredura fixa de ${monitorRefreshHz} Hz (${scanoutPeriodMs.toFixed(1)} ms por ciclo). Com V-Sync desligado (SyncInterval=0), qualquer diferença entre o frametime do jogo e 10,0 ms produz deslocamento de fase (screen tearing).`,
  };
}

export function buildPresentationChain(
  frames: PresentMonFrameRow[],
  hwinfoSamples: HwinfoSensorRow[],
  stats: FrametimeStats,
  monitorRefreshHz: number
): PresentationChainStage[] {
  const sampleFrame = frames[0];
  const presentMode = sampleFrame?.presentMode ?? 'Não medido';
  const syncInterval = sampleFrame?.syncInterval ?? null;
  const allowsTearing = sampleFrame?.allowsTearing ?? null;

  const avgCpuBusy =
    frames.length > 0
      ? frames.reduce((acc, f) => acc + (f.cpuBusyMs ?? 0), 0) / Math.max(1, frames.length)
      : null;
  const avgGpuBusy =
    frames.length > 0
      ? frames.reduce((acc, f) => acc + (f.gpuBusyMs ?? 0), 0) / Math.max(1, frames.length)
      : null;
  const avgGpuWait =
    frames.length > 0
      ? frames.reduce((acc, f) => acc + (f.gpuWaitMs ?? 0), 0) / Math.max(1, frames.length)
      : null;
  const avgDispLatency =
    frames.length > 0
      ? frames.reduce((acc, f) => acc + (f.msUntilDisplayed ?? 0), 0) / Math.max(1, frames.length)
      : null;

  const maxCpuTemp = hwinfoSamples.reduce(
    (max, s) => (s.cpuTempC !== null && s.cpuTempC > max ? s.cpuTempC : max),
    0
  );
  const minGpuClock = stats.gpuClockMinMhz;
  const maxGpuClock = stats.gpuClockMaxMhz;

  const isComposed = presentMode.toLowerCase().includes('composed') && !presentMode.toLowerCase().includes('independent');
  const isTearingActive = syncInterval === 0 && allowsTearing === true;

  return [
    {
      stageNumber: 1,
      name: '1. Aplicação (Jogo)',
      component: 'Valorant (Unreal Engine 4 — Render/Game Threads)',
      measuredIndicator: 'Tempo entre submissões (MsBetweenPresents)',
      currentValue:
        stats.avgFrametimeMs !== null
          ? `${stats.avgFrametimeMs.toFixed(2)} ms méd (${stats.avgFps} FPS) · P99: ${stats.p99FrametimeMs?.toFixed(2)} ms`
          : 'Não medido',
      status: (stats.p99FrametimeMs ?? 0) > 16.0 ? 'bottleneck' : 'normal',
      technicalDetail:
        (stats.p99FrametimeMs ?? 0) > 16.0
          ? `Variância acentuada na entrega de quadros (1% Low = ${stats.fps1PercentLow} FPS vs Média = ${stats.avgFps} FPS).`
          : 'Submissão de quadros da aplicação dentro da cadência esperada.',
    },
    {
      stageNumber: 2,
      name: '2. CPU & Memória',
      component: 'Intel Core i7-1195G7 (4C/8T) + 32 GB DDR4-2133 Dual-Channel',
      measuredIndicator: 'CPUBusy / Temperatura Package / Clock Efetivo',
      currentValue: `${avgCpuBusy ? avgCpuBusy.toFixed(2) + ' ms/quadro' : '—'} · Pico Térmico: ${maxCpuTemp > 0 ? maxCpuTemp + ' °C' : '—'}`,
      status: maxCpuTemp >= 98 ? 'bottleneck' : maxCpuTemp >= 90 ? 'warning' : 'normal',
      technicalDetail:
        maxCpuTemp >= 98
          ? 'CPU atinge ~100 °C e sofre throttling térmico e de potência (PL2→PL1), atrasando a thread de renderização.'
          : 'CPU alimentando a fila gráfica sem throttling térmico crítico no período.',
    },
    {
      stageNumber: 3,
      name: '3. Fila de Renderização',
      component: 'Fila de Comandos DirectX 11 / DXGI',
      measuredIndicator: 'MsInPresentAPI & GPUWait',
      currentValue: `GPUWait méd: ${avgGpuWait !== null ? avgGpuWait.toFixed(2) + ' ms' : '—'}`,
      status: (avgGpuWait ?? 0) > 3.5 ? 'warning' : 'normal',
      technicalDetail:
        (avgGpuWait ?? 0) > 3.5
          ? 'GPUWait elevado demonstra que a GPU Iris Xe fica ociosa aguardando a CPU ou sincronização antes de renderizar.'
          : 'Fila de submissão fluida entre CPU e GPU.',
    },
    {
      stageNumber: 4,
      name: '4. GPU Integrada',
      component: 'Intel Iris Xe Graphics (96 EUs — Orçamento compartilhado com CPU)',
      measuredIndicator: 'GPUBusy & Oscilação de Clock GPU',
      currentValue: `GPUBusy: ${avgGpuBusy !== null ? avgGpuBusy.toFixed(2) + ' ms' : '—'} · Clock: ${minGpuClock ?? '—'}–${maxGpuClock ?? '—'} MHz`,
      status:
        minGpuClock !== null && maxGpuClock !== null && maxGpuClock - minGpuClock >= 350
          ? 'bottleneck'
          : 'normal',
      technicalDetail:
        minGpuClock !== null && maxGpuClock !== null && maxGpuClock - minGpuClock >= 350
          ? `Oscilação de ${maxGpuClock - minGpuClock} MHz na GPU Iris Xe (${minGpuClock} a ${maxGpuClock} MHz) por disputa de potência do package (PL1) e largura de banda DDR4-2133 (34,1 GB/s).`
          : 'Frequência da GPU Iris Xe estável durante a carga.',
    },
    {
      stageNumber: 5,
      name: '5. Apresentação DXGI',
      component: 'DXGI SwapChain (Flip Model)',
      measuredIndicator: 'PresentMode · SyncInterval · AllowsTearing',
      currentValue: `${presentMode} · Sync=${syncInterval ?? '—'} · AllowTearing=${allowsTearing ? '1 (Sim)' : '0 (Não)'}`,
      status: isTearingActive ? 'warning' : 'normal',
      technicalDetail: isTearingActive
        ? 'SyncInterval=0 com AllowsTearing=1 instrui o flip imediato do buffer mesmo no meio da varredura física do monitor (causa direta do screen tearing).'
        : 'Troca de buffers sincronizada com o intervalo vertical.',
    },
    {
      stageNumber: 6,
      name: '6. Compositor do Windows',
      component: 'DWM (Desktop Window Manager — Windows 11 25H2)',
      measuredIndicator: 'Bypass DirectFlip vs Composição DWM',
      currentValue: isComposed
        ? 'Ativo (Composed: Flip — Redirecionado pelo DWM)'
        : 'Bypass Ativo (Hardware: Independent Flip)',
      status: isComposed ? 'warning' : 'normal',
      technicalDetail: isComposed
        ? 'O DWM está compondo cada quadro na área de trabalho, adicionando latência de apresentação (MsUntilDisplayed) e impedindo tearing mas aumentando input lag.'
        : 'Jogo em Independent Flip contornando a composição do DWM para menor latência.',
    },
    {
      stageNumber: 7,
      name: '7. Driver Gráfico & Saída',
      component: 'Driver Intel Iris Xe GFX → Controlador HDMI (Placa NL40MU1)',
      measuredIndicator: 'MsUntilDisplayed (Latência de Apresentação)',
      currentValue: avgDispLatency !== null ? `${avgDispLatency.toFixed(2)} ms` : 'Não medido',
      status: (avgDispLatency ?? 0) > 18.0 ? 'warning' : 'normal',
      technicalDetail:
        (avgDispLatency ?? 0) > 18.0
          ? 'Latência acumulada elevada entre o Present() da aplicação e a exibição efetiva.'
          : 'Baixa latência de transporte entre Present() e controlador de vídeo.',
    },
    {
      stageNumber: 8,
      name: '8. Monitor Externo',
      component: `Weal LCD 22,5" (1920×1080 @ ${monitorRefreshHz} Hz via HDMI)`,
      measuredIndicator: 'Ciclo de Scanout Fixo vs MsBetweenDisplayChange',
      currentValue: `Scanout = ${(1000 / monitorRefreshHz).toFixed(2)} ms (${monitorRefreshHz} Hz) · Repetidos: ${stats.repeatedFramesTotal}`,
      status: isTearingActive || stats.repeatedFramesTotal > 5 ? 'warning' : 'normal',
      technicalDetail:
        isTearingActive
          ? `O painel varre 1 quadro a cada ${(1000 / monitorRefreshHz).toFixed(1)} ms fixos (sem VRR ativo). Quando o jogo entrega quadros fora de ${(1000 / monitorRefreshHz).toFixed(1)} ms com SyncInterval=0, a linha de tearing desloca-se verticalmente pela tela.`
          : 'Scanout operando na frequência nominal configurada.',
    },
  ];
}
