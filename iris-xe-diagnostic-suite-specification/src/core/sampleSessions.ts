import { runCausalDiagnosticEngine } from './diagnosticEngine';
import {
  analyzeVrrStatus,
  buildPresentationChain,
  computeFrametimeMetrics,
} from './presentationAnalysis';
import { generateSafeRecommendations } from './recommendationsEngine';
import { parseHwinfoCsv, parsePresentMonCsv } from './telemetryParsers';
import {
  computeTemporalCorrelations,
  synchronizeTelemetryStreams,
} from './temporalSync';
import { DiagnosticSession } from './types';

export function buildDiagnosticSessionFromCsvs(params: {
  id: string;
  name: string;
  stageType: DiagnosticSession['stageType'];
  presentMonCsv: string;
  hwinfoCsv: string;
  isSimulated: boolean;
  simulationNotice?: string;
  driverVersion?: string;
  osVersion?: string;
  resolution?: string;
  monitorRefreshHz?: number;
  powerPlan?: string;
  windowMode?: DiagnosticSession['windowMode'];
  vsyncConfigured?: boolean;
  fpsLimitConfigured?: number | null;
  vrrConfigured?: boolean;
}): DiagnosticSession {
  const monitorRefreshHz = params.monitorRefreshHz ?? 100;
  const pmOut = parsePresentMonCsv(params.presentMonCsv, {
    isSimulated: params.isSimulated,
  });
  const hwOut = parseHwinfoCsv(params.hwinfoCsv, {
    isSimulated: params.isSimulated,
  });

  const synchronizedStream = synchronizeTelemetryStreams(pmOut.frames, hwOut.samples, {
    windowStepSeconds: 0.5,
    maxHwinfoDeltaSeconds: 1.5,
    monitorRefreshHz,
  });

  const stats = computeFrametimeMetrics(pmOut.frames, hwOut.samples, synchronizedStream);
  const correlations = computeTemporalCorrelations(synchronizedStream);
  const vrrAssessment = analyzeVrrStatus({
    frames: pmOut.frames,
    monitorRefreshHz,
    vrrConfiguredInSession: params.vrrConfigured ?? false,
    edidRawAvailable: true,
    edidClaimsVrr: false,
  });
  const presentationChain = buildPresentationChain(
    pmOut.frames,
    hwOut.samples,
    stats,
    monitorRefreshHz
  );
  const findings = runCausalDiagnosticEngine({
    frames: pmOut.frames,
    hwinfoSamples: hwOut.samples,
    syncStream: synchronizedStream,
    stats,
    correlations,
    vrrAssessment,
    monitorRefreshHz,
  });
  const recommendations = generateSafeRecommendations(
    findings,
    stats,
    monitorRefreshHz
  );

  const telemetrySources: string[] = [];
  if (pmOut.frames.length > 0) {
    telemetrySources.push(
      `${pmOut.detectedVersion} CSV (${pmOut.frames.length} quadros${params.isSimulated ? ' — SIMULADO/REFERÊNCIA' : ''})`
    );
  }
  if (hwOut.samples.length > 0) {
    telemetrySources.push(
      `HWiNFO64 CSV (${hwOut.samples.length} amostras${params.isSimulated ? ' — SIMULADO/REFERÊNCIA' : ''})`
    );
  }

  return {
    id: params.id,
    name: params.name,
    stageType: params.stageType,
    createdAtUtc: new Date(Date.UTC(2026, 2, 15, 18, 0, 0)).toISOString(),
    isSimulated: params.isSimulated,
    simulationNotice: params.simulationNotice,
    hardwareProfileId: 'positivo-master-4250-i7-1195g7',
    driverVersion: params.driverVersion ?? 'Intel GFX 31.0.101.5333 (WDDM 3.1)',
    osVersion: params.osVersion ?? 'Windows 11 Pro 64-bit 25H2 (Build 26200)',
    resolution: params.resolution ?? '1920 × 1080',
    monitorRefreshHz,
    powerPlan: params.powerPlan ?? ' Alto Desempenho / ThrottleStop em Teste',
    windowMode: params.windowMode ?? 'Tela Cheia Exclusiva (Fullscreen)',
    vsyncConfigured: params.vsyncConfigured ?? false,
    fpsLimitConfigured: params.fpsLimitConfigured ?? null,
    vrrConfigured: params.vrrConfigured ?? false,
    telemetrySources,
    presentMonFrames: pmOut.frames,
    hwinfoSamples: hwOut.samples,
    synchronizedStream,
    stats,
    correlations,
    findings,
    recommendations,
    vrrAssessment,
    presentationChain,
    parseNotes: [...pmOut.warnings, ...hwOut.warnings],
  };
}

function generateSessionACsvs(): { presentMonCsv: string; hwinfoCsv: string } {
  // 30 seconds reference capture in Valorant (V-Sync OFF, Uncapped FPS, Fullscreen, 100Hz Weal Monitor)
  // Models initial PL2 burst (28W, GPU 1350 MHz, ~138 FPS), then thermal saturation at 100-101°C around t=11s..24s
  // with PL1 clamped to 15W, GPU clock oscillating between 780 MHz and 1250 MHz, stutter spikes to 34-42 ms,
  // and SyncInterval=0 + AllowsTearing=1 on 100Hz scanout.
  const pmLines: string[] = [
    'Application,PresentMode,SyncInterval,PresentFlags,AllowsTearing,Dropped,TimeInSeconds,MsBetweenPresents,MsBetweenDisplayChange,MsInPresentAPI,MsUntilRenderComplete,MsUntilDisplayed,CPUBusy,CPUWait,GPUBusy,GPUWait',
  ];
  const hwLines: string[] = [
    'TimeInSeconds,Total CPU Usage [%],Max CPU/Thread Usage [%],Core Clocks (avg) [MHz],Core Effective Clocks (avg) [MHz],CPU Package [°C],CPU Package Power [W],PL1 Power Limit [W],PL2 Power Limit [W],Thermal Throttling [Yes/No],Power Limit Exceeded [Yes/No],PROCHOT [Yes/No],GPU Clock [MHz],GPU D3D Usage [%],GPU 3D Usage [%],GPU Copy [%],GPU Video Decode 0 [%],GPU Power [W],GPU Temperature [°C],GPU Thermal Limit [Yes/No],GPU Power Limit [Yes/No],GPU D3D Memory Dynamic [MB],Physical Memory Used [MB],Physical Memory Load [%],Page File Usage [%],Memory Clock [MHz]',
  ];

  // Generate 60 HWiNFO samples at 0.5s intervals (0.0s to 29.5s)
  for (let i = 0; i < 60; i++) {
    const t = Number((i * 0.5).toFixed(2));
    const inThermalThrottleWindow = (t >= 11.0 && t <= 18.5) || (t >= 22.5 && t <= 27.5);
    const inTransition = t >= 8.0 && t < 11.0;

    const cpuTemp = inThermalThrottleWindow
      ? 100 + (i % 3)
      : inTransition
      ? 92 + Math.round((t - 8.0) * 2.5)
      : 78 + Math.round(t * 1.6);

    const pkgPower = inThermalThrottleWindow
      ? Number((14.8 + (i % 3) * 0.4).toFixed(1))
      : Number((26.5 - (i % 4) * 0.5).toFixed(1));

    const effClock = inThermalThrottleWindow
      ? 2150 - (i % 4) * 90
      : inTransition
      ? 3350
      : 3950 - (i % 3) * 50;

    const nomClock = inThermalThrottleWindow ? 2800 : 4200;
    const gpuClock = inThermalThrottleWindow
      ? 800 + (i % 3) * 75
      : inTransition
      ? 1150
      : 1350 - (i % 2) * 50;

    const gpuUsage = inThermalThrottleWindow ? 62 + (i % 5) * 2 : 86 + (i % 4) * 2;
    const cpuMaxThread = inThermalThrottleWindow ? 98 : 88 + (i % 5);
    const cpuTotal = inThermalThrottleWindow ? 74 : 64 + (i % 4);
    const gpuPower = inThermalThrottleWindow ? 5.4 : 10.8;
    const gpuTemp = Math.min(100, cpuTemp - 2);

    hwLines.push(
      [
        t,
        cpuTotal,
        cpuMaxThread,
        nomClock,
        effClock,
        cpuTemp,
        pkgPower,
        15.0,
        28.0,
        inThermalThrottleWindow ? 'Yes' : 'No',
        inThermalThrottleWindow ? 'Yes' : 'No',
        cpuTemp >= 100 ? 'Yes' : 'No',
        gpuClock,
        gpuUsage,
        gpuUsage,
        4.2,
        0.0,
        gpuPower,
        gpuTemp,
        inThermalThrottleWindow ? 'Yes' : 'No',
        inThermalThrottleWindow ? 'Yes' : 'No',
        3420 + i * 2,
        11450 + i * 3,
        35.0,
        2.1,
        1066.7,
      ].join(',')
    );
  }

  // Generate PresentMon frames (~180 frames across 0..29.5s)
  let currentT = 0.05;
  let frameCounter = 0;
  while (currentT <= 29.5) {
    const inThermal = (currentT >= 11.0 && currentT <= 18.5) || (currentT >= 22.5 && currentT <= 27.5);
    const isStutterSpike =
      inThermal && (frameCounter % 19 === 0 || Math.abs(currentT - 13.5) < 0.08 || Math.abs(currentT - 24.0) < 0.08);

    // Notice how during normal play FT is ~7.4ms (~135 FPS), during thermal clamp FT hovers around 9.6-10.6ms (94-104 FPS -> stationary tear line on 100Hz!), and spikes hit 31-41ms!
    const ft = isStutterSpike
      ? Number((32.4 + (frameCounter % 3) * 4.2).toFixed(2))
      : inThermal
      ? Number((9.85 + ((frameCounter % 5) - 2) * 0.32).toFixed(2))
      : Number((7.35 + ((frameCounter % 4) - 1.5) * 0.22).toFixed(2));

    const dispChange = isStutterSpike ? 30.0 : 10.0; // Quantized to 10.0ms (100Hz fixed scanout)
    const cpuBusy = isStutterSpike
      ? Number((ft * 0.82).toFixed(2))
      : inThermal
      ? Number((ft * 0.68).toFixed(2))
      : Number((ft * 0.52).toFixed(2));
    const cpuWait = Number(Math.max(0.1, ft - cpuBusy).toFixed(2));
    const gpuBusy = isStutterSpike
      ? Number((ft * 0.34).toFixed(2)) // GPU starves while waiting for CPU during stutter!
      : inThermal
      ? Number((ft * 0.62).toFixed(2))
      : Number((ft * 0.84).toFixed(2));
    const gpuWait = Number(Math.max(0.2, ft - gpuBusy).toFixed(2));
    const untilDisplayed = Number((ft + 2.1).toFixed(2));

    pmLines.push(
      [
        'VALORANT-Win64-Shipping.exe',
        'Hardware: Independent Flip',
        0,
        512,
        1,
        0,
        currentT.toFixed(3),
        ft,
        dispChange.toFixed(2),
        0.45,
        ft.toFixed(2),
        untilDisplayed,
        cpuBusy,
        cpuWait,
        gpuBusy,
        gpuWait,
      ].join(',')
    );

    // Advance time to ensure dense coverage across the 30s timeline
    currentT = Number((currentT + 0.16).toFixed(3));
    frameCounter++;
  }

  return {
    presentMonCsv: pmLines.join('\n'),
    hwinfoCsv: hwLines.join('\n'),
  };
}

function generateSessionBCsvs(): { presentMonCsv: string; hwinfoCsv: string } {
  // Session B: A/B Comparison with non-harmonic 117 FPS Cap (8.55 ms) + Windows Balanced Power Mode + Elevated Rear Airflow
  // Shows CPU temp staying at 85-89°C (below TCC activation), zero thermal throttling, stable GPU clock 1180-1250 MHz,
  // 1% low jumping from ~30 FPS to ~96 FPS, and tear phase shifting rapidly instead of lingering at 10.0ms.
  const pmLines: string[] = [
    'Application,PresentMode,SyncInterval,PresentFlags,AllowsTearing,Dropped,TimeInSeconds,MsBetweenPresents,MsBetweenDisplayChange,MsInPresentAPI,MsUntilRenderComplete,MsUntilDisplayed,CPUBusy,CPUWait,GPUBusy,GPUWait',
  ];
  const hwLines: string[] = [
    'TimeInSeconds,Total CPU Usage [%],Max CPU/Thread Usage [%],Core Clocks (avg) [MHz],Core Effective Clocks (avg) [MHz],CPU Package [°C],CPU Package Power [W],PL1 Power Limit [W],PL2 Power Limit [W],Thermal Throttling [Yes/No],Power Limit Exceeded [Yes/No],PROCHOT [Yes/No],GPU Clock [MHz],GPU D3D Usage [%],GPU 3D Usage [%],GPU Copy [%],GPU Video Decode 0 [%],GPU Power [W],GPU Temperature [°C],GPU Thermal Limit [Yes/No],GPU Power Limit [Yes/No],GPU D3D Memory Dynamic [MB],Physical Memory Used [MB],Physical Memory Load [%],Page File Usage [%],Memory Clock [MHz]',
  ];

  for (let i = 0; i < 60; i++) {
    const t = Number((i * 0.5).toFixed(2));
    const cpuTemp = 82 + (i % 6);
    const pkgPower = Number((17.5 + (i % 3) * 0.6).toFixed(1));
    const effClock = 3450 + (i % 3) * 40;
    const gpuClock = 1200 + (i % 2) * 50;
    const gpuUsage = 78 + (i % 4);

    hwLines.push(
      [
        t,
        54 + (i % 3),
        79 + (i % 4),
        3800,
        effClock,
        cpuTemp,
        pkgPower,
        18.0,
        28.0,
        'No',
        'No',
        'No',
        gpuClock,
        gpuUsage,
        gpuUsage,
        3.5,
        0.0,
        8.2,
        cpuTemp - 2,
        'No',
        'No',
        3390,
        11200,
        34.2,
        2.0,
        1066.7,
      ].join(',')
    );
  }

  let currentT = 0.05;
  let frameCounter = 0;
  while (currentT <= 29.5) {
    const ft = Number((8.54 + ((frameCounter % 5) - 2) * 0.14).toFixed(2)); // ~117 FPS capped
    const cpuBusy = Number((ft * 0.54).toFixed(2));
    const cpuWait = Number((ft - cpuBusy).toFixed(2));
    const gpuBusy = Number((ft * 0.76).toFixed(2));
    const gpuWait = Number((ft - gpuBusy).toFixed(2));

    pmLines.push(
      [
        'VALORANT-Win64-Shipping.exe',
        'Hardware: Independent Flip',
        0,
        512,
        1,
        0,
        currentT.toFixed(3),
        ft,
        '10.00',
        0.38,
        ft.toFixed(2),
        (ft + 1.85).toFixed(2),
        cpuBusy,
        cpuWait,
        gpuBusy,
        gpuWait,
      ].join(',')
    );

    currentT = Number((currentT + 0.16).toFixed(3));
    frameCounter++;
  }

  return {
    presentMonCsv: pmLines.join('\n'),
    hwinfoCsv: hwLines.join('\n'),
  };
}

function generateSessionCCsvs(): { presentMonCsv: string; hwinfoCsv: string } {
  // Session C: A/B Comparison with Composed: Flip / V-Sync ON (SyncInterval=1, AllowsTearing=0)
  // Eliminates tearing, but adds ~15ms presentation latency (MsUntilDisplayed ~ 25.4 ms) and causes repeated 20.0ms scans whenever frame misses 10.0ms deadline.
  const pmLines: string[] = [
    'Application,PresentMode,SyncInterval,PresentFlags,AllowsTearing,Dropped,TimeInSeconds,MsBetweenPresents,MsBetweenDisplayChange,MsInPresentAPI,MsUntilRenderComplete,MsUntilDisplayed,CPUBusy,CPUWait,GPUBusy,GPUWait',
  ];
  const hwLines: string[] = [
    'TimeInSeconds,Total CPU Usage [%],Max CPU/Thread Usage [%],Core Clocks (avg) [MHz],Core Effective Clocks (avg) [MHz],CPU Package [°C],CPU Package Power [W],PL1 Power Limit [W],PL2 Power Limit [W],Thermal Throttling [Yes/No],Power Limit Exceeded [Yes/No],PROCHOT [Yes/No],GPU Clock [MHz],GPU D3D Usage [%],GPU 3D Usage [%],GPU Copy [%],GPU Video Decode 0 [%],GPU Power [W],GPU Temperature [°C],GPU Thermal Limit [Yes/No],GPU Power Limit [Yes/No],GPU D3D Memory Dynamic [MB],Physical Memory Used [MB],Physical Memory Load [%],Page File Usage [%],Memory Clock [MHz]',
  ];

  for (let i = 0; i < 40; i++) {
    const t = Number((i * 0.5).toFixed(2));
    hwLines.push(
      [
        t,
        52,
        81,
        3600,
        3250,
        86 + (i % 4),
        16.4,
        15.0,
        28.0,
        'No',
        'No',
        'No',
        1150,
        74,
        74,
        4.8,
        0.0,
        7.8,
        84,
        'No',
        'No',
        3410,
        11300,
        34.5,
        2.0,
        1066.7,
      ].join(',')
    );
  }

  let currentT = 0.05;
  let frameCounter = 0;
  while (currentT <= 19.5) {
    const missedVblank = frameCounter % 9 === 0;
    const ft = missedVblank ? 13.8 : 10.0;
    const dispChange = missedVblank ? 20.0 : 10.0; // Repeated frame on missed V-Blank!
    const untilDisplayed = missedVblank ? 29.4 : 24.8; // High input lag from V-Sync / DWM queue!

    pmLines.push(
      [
        'VALORANT-Win64-Shipping.exe',
        'Composed: Flip',
        1,
        0,
        0,
        missedVblank ? 1 : 0,
        currentT.toFixed(3),
        ft.toFixed(2),
        dispChange.toFixed(2),
        1.85,
        (ft - 1.2).toFixed(2),
        untilDisplayed.toFixed(2),
        4.9,
        (ft - 4.9).toFixed(2),
        6.8,
        (ft - 6.8).toFixed(2),
      ].join(',')
    );

    currentT = Number((currentT + 0.16).toFixed(3));
    frameCounter++;
  }

  return {
    presentMonCsv: pmLines.join('\n'),
    hwinfoCsv: hwLines.join('\n'),
  };
}

function generateSessionDCsvs(): { presentMonCsv: string; hwinfoCsv: string } {
  // Session D: Repouso & Aquecimento Controlado (Baseline validation)
  const pmLines: string[] = [
    'Application,PresentMode,SyncInterval,PresentFlags,AllowsTearing,Dropped,TimeInSeconds,MsBetweenPresents,MsBetweenDisplayChange,MsInPresentAPI,MsUntilRenderComplete,MsUntilDisplayed,CPUBusy,CPUWait,GPUBusy,GPUWait',
  ];
  const hwLines: string[] = [
    'TimeInSeconds,Total CPU Usage [%],Max CPU/Thread Usage [%],Core Clocks (avg) [MHz],Core Effective Clocks (avg) [MHz],CPU Package [°C],CPU Package Power [W],PL1 Power Limit [W],PL2 Power Limit [W],Thermal Throttling [Yes/No],Power Limit Exceeded [Yes/No],PROCHOT [Yes/No],GPU Clock [MHz],GPU D3D Usage [%],GPU 3D Usage [%],GPU Copy [%],GPU Video Decode 0 [%],GPU Power [W],GPU Temperature [°C],GPU Thermal Limit [Yes/No],GPU Power Limit [Yes/No],GPU D3D Memory Dynamic [MB],Physical Memory Used [MB],Physical Memory Load [%],Page File Usage [%],Memory Clock [MHz]',
  ];

  for (let i = 0; i < 30; i++) {
    const t = Number((i * 0.5).toFixed(2));
    const warming = t >= 7.5;
    hwLines.push(
      [
        t,
        warming ? 38 : 4,
        warming ? 68 : 12,
        warming ? 3900 : 1400,
        warming ? 2950 : 185,
        warming ? 74 : 47,
        warming ? 19.2 : 3.4,
        15.0,
        28.0,
        'No',
        'No',
        'No',
        warming ? 1100 : 350,
        warming ? 48 : 3,
        warming ? 46 : 2,
        1.1,
        0.0,
        warming ? 6.1 : 0.4,
        warming ? 72 : 45,
        'No',
        'No',
        1240,
        6420,
        19.6,
        1.2,
        1066.7,
      ].join(',')
    );
  }

  let currentT = 0.05;
  while (currentT <= 14.5) {
    pmLines.push(
      [
        'dwm.exe',
        'Hardware: Independent Flip',
        1,
        0,
        0,
        0,
        currentT.toFixed(3),
        '10.00',
        '10.00',
        0.15,
        1.2,
        '10.20',
        0.6,
        9.4,
        0.8,
        9.2,
      ].join(',')
    );
    currentT = Number((currentT + 0.25).toFixed(3));
  }

  return {
    presentMonCsv: pmLines.join('\n'),
    hwinfoCsv: hwLines.join('\n'),
  };
}

export function createReferenceDiagnosticSessions(): DiagnosticSession[] {
  const simBanner =
    'SESSÃO DE REFERÊNCIA PRÉ-CARREGADA (SIMULADA PARA VALIDAÇÃO E COMPARAÇÃO A/B): Esta sessão modela o comportamento documentado do Positivo Master 4250 (i7-1195G7 + Iris Xe 96 EUs + 32 GB DDR4-2133 + Monitor Weal 100 Hz). Para analisar medições reais da sua máquina, utilize o botão "Importar CSV Real (PresentMon + HWiNFO64)" no topo.';

  const csvA = generateSessionACsvs();
  const csvB = generateSessionBCsvs();
  const csvC = generateSessionCCsvs();
  const csvD = generateSessionDCsvs();

  return [
    buildDiagnosticSessionFromCsvs({
      id: 'session-a-valorant-uncapped-vsync-off',
      name: 'Sessão A: Jogo (Valorant — V-Sync OFF · FPS Ilimitado · Tela Cheia · Throttling 101°C)',
      stageType: 'Sessão de Jogo (Valorant)',
      presentMonCsv: csvA.presentMonCsv,
      hwinfoCsv: csvA.hwinfoCsv,
      isSimulated: true,
      simulationNotice: simBanner,
      windowMode: 'Tela Cheia Exclusiva (Fullscreen)',
      vsyncConfigured: false,
      fpsLimitConfigured: null,
      vrrConfigured: false,
      powerPlan: 'Alto Desempenho (PL2 28W → PL1 15W após saturação térmica)',
    }),
    buildDiagnosticSessionFromCsvs({
      id: 'session-b-valorant-117fps-cap-balanced',
      name: 'Sessão B (Teste A/B): Jogo (Valorant — Limite 117 FPS Não-Harmônico · V-Sync OFF · Equilibrado)',
      stageType: 'Repetição / Comparação A/B',
      presentMonCsv: csvB.presentMonCsv,
      hwinfoCsv: csvB.hwinfoCsv,
      isSimulated: true,
      simulationNotice: simBanner,
      windowMode: 'Tela Cheia Exclusiva (Fullscreen)',
      vsyncConfigured: false,
      fpsLimitConfigured: 117,
      vrrConfigured: false,
      powerPlan: 'Equilibrado Windows 11 + Base Elevada',
    }),
    buildDiagnosticSessionFromCsvs({
      id: 'session-c-valorant-borderless-vsync-on',
      name: 'Sessão C (Teste A/B): Comparativo Modo Sem Bordas + V-Sync Ligado (Medição de Input Lag)',
      stageType: 'Repetição / Comparação A/B',
      presentMonCsv: csvC.presentMonCsv,
      hwinfoCsv: csvC.hwinfoCsv,
      isSimulated: true,
      simulationNotice: simBanner,
      windowMode: 'Sem Bordas (Borderless Windowed)',
      vsyncConfigured: true,
      fpsLimitConfigured: 100,
      vrrConfigured: false,
      powerPlan: 'Equilibrado Windows 11',
    }),
    buildDiagnosticSessionFromCsvs({
      id: 'session-d-idle-controlled-warmup',
      name: 'Sessão D: Repouso & Aquecimento Controlado (Linha de Base Térmica e Processos)',
      stageType: 'Repouso',
      presentMonCsv: csvD.presentMonCsv,
      hwinfoCsv: csvD.hwinfoCsv,
      isSimulated: true,
      simulationNotice: simBanner,
      windowMode: 'Tela Cheia Exclusiva (Fullscreen)',
      vsyncConfigured: true,
      fpsLimitConfigured: 100,
      vrrConfigured: false,
      powerPlan: 'Equilibrado Windows 11',
    }),
  ];
}

export function getSampleCsvTemplates(): {
  presentMonCsv: string;
  hwinfoCsv: string;
} {
  return generateSessionACsvs();
}
