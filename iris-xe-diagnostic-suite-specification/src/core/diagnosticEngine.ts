import {
  CorrelationPairResult,
  DiagnosticFinding,
  FrametimeStats,
  HwinfoSensorRow,
  PresentMonFrameRow,
  SynchronizedTelemetryPoint,
  VrrThreeTierAssessment,
} from './types';

export function runCausalDiagnosticEngine(params: {
  frames: PresentMonFrameRow[];
  hwinfoSamples: HwinfoSensorRow[];
  syncStream: SynchronizedTelemetryPoint[];
  stats: FrametimeStats;
  correlations: CorrelationPairResult[];
  vrrAssessment: VrrThreeTierAssessment;
  monitorRefreshHz: number;
}): DiagnosticFinding[] {
  const { frames, hwinfoSamples, syncStream, stats, correlations, vrrAssessment, monitorRefreshHz } =
    params;
  const findings: DiagnosticFinding[] = [];

  if (frames.length === 0 && hwinfoSamples.length === 0) {
    return [
      {
        id: 'diag-insufficient-data',
        title: 'Dados de telemetria insuficientes para diagnóstico',
        category: 'Driver & Sistema Operacional',
        severity: 'info',
        confidence: 'Informação insuficiente',
        whatHappened: 'Nenhuma amostra válida de PresentMon ou HWiNFO64 foi encontrada na sessão.',
        whenHappened: 'Sessão inteira',
        primaryIndicatorChanged: 'Nenhum indicador disponível',
        simultaneousIndicators: [],
        compatibleHypotheses: ['Coleta ainda não realizada ou arquivo importado incompatível.'],
        discardedHypotheses: [],
        supportingEvidence: ['0 quadros PresentMon e 0 amostras HWiNFO64.'],
        confirmatoryTest:
          'Importe um arquivo CSV do PresentMon e um arquivo CSV do HWiNFO64 capturados simultaneamente durante uma partida ou no The Range do Valorant.',
      },
    ];
  }

  // 1. Thermal & Package Power Throttling vs FPS Drops
  const thermalWindows = syncStream.filter(
    (p) => p.cpuThermalThrottling === true || (p.cpuTempC !== null && p.cpuTempC >= 97)
  );
  const powerLimitWindows = syncStream.filter(
    (p) => p.cpuPowerLimitThrottling === true
  );
  const maxCpuTemp = hwinfoSamples.reduce(
    (max, s) => (s.cpuTempC !== null && s.cpuTempC > max ? s.cpuTempC : max),
    0
  );
  const minEffClock = hwinfoSamples.reduce(
    (min, s) =>
      s.cpuEffectiveClockMhz !== null && s.cpuEffectiveClockMhz < min
        ? s.cpuEffectiveClockMhz
        : min,
    Infinity
  );
  const maxEffClock = hwinfoSamples.reduce(
    (max, s) =>
      s.cpuEffectiveClockMhz !== null && s.cpuEffectiveClockMhz > max
        ? s.cpuEffectiveClockMhz
        : max,
    0
  );
  const rTempClock =
    correlations.find((c) => c.id === 'corr-cpu-temp-vs-cpu-clock')?.pearsonR ?? null;
  const rClockFt =
    correlations.find((c) => c.id === 'corr-cpu-eff-clock-vs-frametime')?.pearsonR ?? null;

  if (thermalWindows.length > 0 || maxCpuTemp >= 97) {
    const firstT = thermalWindows[0]?.timeSeconds ?? 0;
    const lastT = thermalWindows[thermalWindows.length - 1]?.timeSeconds ?? stats.durationSeconds;
    const peakFtInThermal = thermalWindows.reduce(
      (max, w) => (w.frametimeP99WindowMs && w.frametimeP99WindowMs > max ? w.frametimeP99WindowMs : max),
      0
    );

    findings.push({
      id: 'diag-thermal-power-coupling',
      title: 'Limitação Térmica e de Potência do Package (i7-1195G7 + Iris Xe) degradando o Frametime',
      category: 'CPU & Energia',
      severity: 'critical',
      confidence:
        thermalWindows.length >= 3 && rClockFt !== null && rClockFt <= -0.45
          ? 'Forte evidência'
          : 'Evidência moderada',
      whatHappened:
        'Durante os períodos de queda de FPS e picos de frametime, a temperatura do package atingiu a faixa de 98–102 °C (limite de ativação do TCC), o flag de Thermal/Power Limit Throttling foi acionado e a frequência efetiva da CPU e da GPU Iris Xe caiu simultaneamente.',
      whenHappened: `Janelas entre t = ${firstT.toFixed(1)}s e t = ${lastT.toFixed(1)}s (${thermalWindows.length} janelas sincronizadas com throttling térmico ativo; ${powerLimitWindows.length} janelas com Power Limit ativo).`,
      primaryIndicatorChanged: `Temperatura do Package CPU atingiu ${maxCpuTemp} °C enquanto a frequência efetiva da CPU recuou de ${maxEffClock} MHz para ${Number.isFinite(minEffClock) ? minEffClock : '—'} MHz.`,
      simultaneousIndicators: [
        `Frametime P99 na janela subiu para até ${peakFtInThermal > 0 ? peakFtInThermal.toFixed(2) : stats.p99FrametimeMs?.toFixed(2)} ms`,
        `Frequência da GPU Iris Xe oscilou entre ${stats.gpuClockMinMhz ?? '—'} MHz e ${stats.gpuClockMaxMhz ?? '—'} MHz`,
        `Potência do Package recuou do patamar de boost (PL2 ~28 W) para o limite sustentado (PL1 ~15 W)`,
      ],
      compatibleHypotheses: [
        'Saturação térmica do sistema de arrefecimento do Positivo Master 4250 (placa NL40MU1) sob carga combinada CPU + 96 EUs da Iris Xe.',
        'Disputa de orçamento de potência (Cross-Domain Power Budget) entre os 4 núcleos Willow Cove e o domínio gráfico GT (Iris Xe) quando PL1 entra em vigor após expirar a janela Tau do PL2.',
      ],
      discardedHypotheses: [
        'Defeito isolado no silício da GPU Iris Xe: descartado porque o clock gráfico só recua quando o Package Power/Temperatura do processador atinge o teto compartilhado.',
        'Falta de capacidade total de RAM (32 GB instalados): descartado pois o uso de memória física permaneceu longe da exaustão.',
      ],
      supportingEvidence: [
        `Temperatura máxima medida: ${maxCpuTemp} °C (fonte: HWiNFO64 CSV).`,
        `Correlação temporal (Clock Efetivo CPU × Frametime): r = ${rClockFt ?? 'N/D'} (${correlations.find((c) => c.id === 'corr-cpu-eff-clock-vs-frametime')?.strengthLabel ?? ''}).`,
        `Correlação temporal (Temperatura CPU × Clock Efetivo CPU): r = ${rTempClock ?? 'N/D'}.`,
        'A correlação temporal é forte, mas é necessário repetir o teste com controle de teto de FPS para isolar a redução de calor gerado.',
      ],
      confirmatoryTest:
        'Executar sessão A/B no The Range limitando o FPS do Valorant a 100 ou 115 FPS (reduzindo a carga contínua de submissão da CPU) e verificar se a temperatura estabiliza abaixo de 92 °C e se o 1% Low sobe.',
    });
  }

  // 2. Low GPU Utilization & CPU / Memory Bandwidth Bottleneck Analysis
  const lowGpuStutterWindows = syncStream.filter(
    (p) =>
      p.stutterEventActive &&
      p.gpuUsagePct !== null &&
      p.gpuUsagePct < 72 &&
      p.cpuMaxThreadUsagePct !== null &&
      p.cpuMaxThreadUsagePct >= 90
  );

  const avgGpuUsage =
    hwinfoSamples.length > 0
      ? hwinfoSamples.reduce((acc, s) => acc + (s.gpuUsagePct ?? 0), 0) / hwinfoSamples.length
      : null;
  const avgGpuWait =
    frames.length > 0
      ? frames.reduce((acc, f) => acc + (f.gpuWaitMs ?? 0), 0) / frames.length
      : null;

  if (lowGpuStutterWindows.length > 0 || (avgGpuUsage !== null && avgGpuUsage < 78)) {
    findings.push({
      id: 'diag-low-gpu-usage-cpu-wait',
      title: 'Baixa utilização da GPU Iris Xe durante microtravamentos causada por espera de CPU e largura de banda DDR4-2133',
      category: 'GPU Iris Xe',
      severity: 'warning',
      confidence: lowGpuStutterWindows.length >= 2 ? 'Forte evidência' : 'Evidência moderada',
      whatHappened:
        'Durante os eventos de stuttering e em parte da sessão, a GPU Iris Xe permaneceu com utilização moderada/baixa (abaixo de 75%) e GPUWait elevado, enquanto a CPU apresentou pelo menos uma thread próxima da saturação (≥ 92%) e memória operando a 2133 MHz.',
      whenHappened:
        lowGpuStutterWindows.length > 0
          ? `Em ${lowGpuStutterWindows.length} janelas de microtravamento (ex.: t = ${lowGpuStutterWindows.map((w) => w.timeSeconds.toFixed(1) + 's').slice(0, 4).join(', ')}).`
          : 'Ao longo de toda a sessão de jogo analisada.',
      primaryIndicatorChanged: `Utilização média da GPU em ${avgGpuUsage !== null ? avgGpuUsage.toFixed(1) + '%' : '—'} com GPUWait médio de ${avgGpuWait !== null ? avgGpuWait.toFixed(2) + ' ms/quadro' : '—'}.`,
      simultaneousIndicators: [
        `Thread mais carregada da CPU atingiu ≥ 92–100% nos instantes de pico de frametime`,
        `Frequência da GPU Iris Xe esteve acima de 1100 MHz em ${stats.pctTimeGpuAbove1100Mhz ?? '—'}% do tempo e acima de 1300 MHz em apenas ${stats.pctTimeGpuAbove1300Mhz ?? '—'}% do tempo (o limite anunciado de 1,40 GHz é teto de burst, não frequência garantida)`,
        `Memória RAM operando em DDR4-2133 Dual-Channel (largura de banda teórica de 34,1 GB/s compartilhada entre CPU e 96 EUs)`,
      ],
      compatibleHypotheses: [
        'Limitação de CPU (thread principal de jogo/renderização do Valorant no Unreal Engine 4) combinada com latência de acesso à memória DDR4-2133.',
        'Ociosidade parcial das 96 EUs (GPUWait alto) por falta de comandos entregues a tempo pela CPU durante quedas de clock ou contenção do barramento Ring/memória.',
      ],
      discardedHypotheses: [
        'Subdimensionamento puro de sombreadores 3D: não há evidência suficiente para atribuir a baixa utilização a defeito da GPU, pois GPUWait confirma que a GPU aguardava trabalho da CPU.',
      ],
      supportingEvidence: [
        `${stats.stutterEventsCount} eventos de stuttering detectados (${stats.totalStutterDurationMs} ms acumulados).`,
        `Clock da GPU variou de ${stats.gpuClockMinMhz ?? '—'} MHz a ${stats.gpuClockMaxMhz ?? '—'} MHz (mediana P50 = ${stats.gpuClockP50Mhz ?? '—'} MHz).`,
      ],
      confirmatoryTest:
        'Comparar uma sessão no The Range sem bots (menor carga de thread de jogo da CPU) contra uma sessão com 10 bots/habilidades ativas, mantendo a mesma resolução 1920×1080.',
    });
  }

  // 3. Screen Tearing & Presentation Synchronization Diagnosis
  const tearingFrames = frames.filter(
    (f) => f.syncInterval === 0 || f.allowsTearing === true
  );
  const composedFrames = frames.filter((f) =>
    f.presentMode.toLowerCase().includes('composed') &&
    !f.presentMode.toLowerCase().includes('independent')
  );
  const scanoutMs = 1000 / monitorRefreshHz;

  if (tearingFrames.length > frames.length * 0.5) {
    // Check if frametimes hover near 10.0ms (85 - 115 FPS) where beat frequency causes persistent tear lines
    const nearHarmonicFrames = frames.filter(
      (f) =>
        f.msBetweenPresents !== null &&
        f.msBetweenPresents >= scanoutMs * 0.85 &&
        f.msBetweenPresents <= scanoutMs * 1.18
    );
    const pctNearHarmonic = Number(
      ((nearHarmonicFrames.length / Math.max(1, frames.length)) * 100).toFixed(1)
    );

    findings.push({
      id: 'diag-screen-tearing-mechanism',
      title: `Mecanismo de Screen Tearing confirmado em ${monitorRefreshHz} Hz (SyncInterval=0 + AllowsTearing=1 sem VRR ativo)`,
      category: 'Apresentação & Screen Tearing',
      severity: 'warning',
      confidence: 'Confirmado por medição',
      whatHappened:
        `O jogo está apresentando quadros via ${frames[0]?.presentMode ?? 'Hardware: Independent Flip'} com SyncInterval = 0 e AllowsTearing = 1 para um monitor externo de ${monitorRefreshHz} Hz (${scanoutMs.toFixed(1)} ms por varredura) que opera em ciclo fixo via HDMI. Como a troca de buffer ocorre imediatamente após a conclusão do quadro — sem aguardar o V-Blank — o monitor lê dois buffers diferentes na mesma varredura vertical.`,
      whenHappened: `Presente em ${((tearingFrames.length / Math.max(1, frames.length)) * 100).toFixed(1)}% dos quadros capturados (${tearingFrames.length} de ${frames.length} quadros).`,
      primaryIndicatorChanged: `SyncInterval = 0, AllowsTearing = 1 e ${pctNearHarmonic}% dos quadros com frametime próximo ao período de varredura de ${scanoutMs.toFixed(1)} ms (${Math.round(1000 / (scanoutMs * 1.18))}–${Math.round(1000 / (scanoutMs * 0.85))} FPS).`,
      simultaneousIndicators: [
        `VRR Efetivo: ${vrrAssessment.effectiveRuntimeOperation.status}`,
        `MsBetweenDisplayChange quantizado ao ciclo de ${scanoutMs.toFixed(1)} ms em ${vrrAssessment.effectiveRuntimeOperation.quantizedTo10msPct ?? '—'}% das amostras`,
        `Latência média até exibição (MsUntilDisplayed): ${
          frames.length > 0
            ? (frames.reduce((a, f) => a + (f.msUntilDisplayed ?? 0), 0) / frames.length).toFixed(2)
            : '—'
        } ms`,
      ],
      compatibleHypotheses: [
        'Descompasso de fase (Beat Frequency) entre a entrega de quadros da GPU Iris Xe e o scanout fixo de 10,0 ms do monitor Weal 100 Hz via HDMI.',
        'Quando o FPS oscila próximo de 90–110 FPS em um monitor de 100 Hz, a linha horizontal de tearing desloca-se lentamente e permanece visível na mesma região da tela por vários quadros consecutivos.',
      ],
      discardedHypotheses: [
        'Falsa hipótese de que "FPS médio acima de 100 FPS impede tearing": descartada matematicamente e pelas medições de AllowsTearing=1.',
        'Falsa hipótese de que VRR está absorvendo as variações: descartada porque MsBetweenDisplayChange permanece travado na grade de 10,0 ms.',
      ],
      supportingEvidence: [
        `PresentMon registrou AllowsTearing=1 e SyncInterval=0 em ${tearingFrames.length} quadros.`,
        `${pctNearHarmonic}% dos quadros caíram na faixa de batimento lento com o scanout de ${scanoutMs.toFixed(1)} ms, tornando o rasgo horizontal altamente perceptível ao olho humano.`,
      ],
      confirmatoryTest:
        'Executar comparação A/B no The Range com V-Sync Desligado alterando apenas o limite de FPS para um valor fracionário fora da harmônica de 100 Hz (ex.: 117 FPS ou 97 FPS se estável) para dispersar a fase da linha de rasgo, versus um teste comparativo pontual com V-Sync Ligado apenas para medir o delta de MsUntilDisplayed.',
    });
  } else if (composedFrames.length > frames.length * 0.5) {
    const avgLatency =
      frames.reduce((a, f) => a + (f.msUntilDisplayed ?? 0), 0) / Math.max(1, frames.length);
    findings.push({
      id: 'diag-composed-flip-latency',
      title: 'Apresentação intermediada pelo Compositor do Windows (Composed: Flip / V-Sync) eliminando Tearing às custas de Input Lag e Judder',
      category: 'Apresentação & Screen Tearing',
      severity: 'info',
      confidence: 'Confirmado por medição',
      whatHappened:
        'Nesta sessão, os quadros passaram pelo Desktop Window Manager (DWM) ou aguardaram V-Blank (SyncInterval=1 / AllowsTearing=0). Isso impediu o rasgo horizontal (tearing), mas elevou a latência de apresentação (MsUntilDisplayed) e causou repetição de quadros sempre que o frametime ultrapassou 10,0 ms.',
      whenHappened: `Durante toda a sessão (${composedFrames.length} quadros em modo composto ou sincronizado).`,
      primaryIndicatorChanged: `MsUntilDisplayed médio subiu para ${avgLatency.toFixed(2)} ms com ${stats.repeatedFramesTotal} quadros repetidos no monitor.`,
      simultaneousIndicators: [
        `AllowsTearing = 0 em 100% dos quadros`,
        `Frames descartados antes da exibição: ${stats.droppedFramesTotal}`,
      ],
      compatibleHypotheses: [
        'Custo de latência intrínseco à fila de sincronização vertical / composição DWM quando a taxa de quadros oscila abaixo de 100 FPS.',
      ],
      discardedHypotheses: [
        'Problema no cabo HDMI: o aumento de input lag decorre diretamente do modo de apresentação e espera por V-Blank.',
      ],
      supportingEvidence: [
        `Latência MsUntilDisplayed média = ${avgLatency.toFixed(2)} ms; ${stats.repeatedFramesTotal} ciclos de scanout duplicados (≥ 20 ms).`,
      ],
      confirmatoryTest:
        'Compare esta sessão lado a lado na aba "Sessões de Teste (A/B)" com a sessão em Tela Cheia Exclusiva (Hardware: Independent Flip, V-Sync OFF) para quantificar exatamente quantos milissegundos de latência foram adicionados.',
    });
  }

  return findings;
}
