export type DataValidity =
  | 'valid'
  | 'missing'
  | 'invalid'
  | 'estimated'
  | 'simulated'
  | 'unavailable';

export interface TelemetryValue<T = number> {
  value: T | null;
  unit: string;
  source: string;
  timestampUtc: string;
  validity: DataValidity;
  isMissing: boolean;
  isEstimated: boolean;
  isSimulated: boolean;
  errorMessage?: string;
}

export type ConfidenceLevel =
  | 'Confirmado por medição'
  | 'Forte evidência'
  | 'Evidência moderada'
  | 'Hipótese'
  | 'Informação insuficiente';

export type AcceptanceCriterionStatus =
  | 'Implementado e testado'
  | 'Implementado, mas não testado no hardware real'
  | 'Parcialmente implementado'
  | 'Não implementado'
  | 'Bloqueado por limitação externa'
  | 'Não aplicável';

export interface PresentMonFrameRow {
  frameIndex: number;
  timeInSeconds: number;
  timestampUtc: string;
  application: string;
  presentMode: string;
  syncInterval: number | null;
  presentFlags: number | null;
  allowsTearing: boolean | null;
  dropped: boolean | null;
  msBetweenPresents: number | null;
  msBetweenDisplayChange: number | null;
  msInPresentApi: number | null;
  msUntilRenderComplete: number | null;
  msUntilDisplayed: number | null;
  cpuBusyMs: number | null;
  cpuWaitMs: number | null;
  gpuLatencyMs: number | null;
  gpuTimeMs: number | null;
  gpuBusyMs: number | null;
  gpuWaitMs: number | null;
  displayLatencyMs: number | null;
  isSimulated: boolean;
  rawLineNumber: number;
  parseWarnings: string[];
}

export interface HwinfoSensorRow {
  sampleIndex: number;
  timeInSeconds: number;
  timestampUtc: string;
  cpuUsageTotalPct: number | null;
  cpuMaxThreadUsagePct: number | null;
  cpuCoreUsagePct: (number | null)[];
  cpuNominalClockMhz: number | null;
  cpuEffectiveClockMhz: number | null;
  cpuTempC: number | null;
  cpuPackagePowerW: number | null;
  cpuPl1W: number | null;
  cpuPl2W: number | null;
  cpuThermalThrottling: boolean | null;
  cpuPowerLimitThrottling: boolean | null;
  cpuProchotActive: boolean | null;
  cpuEppValue: number | null;
  gpuClockMhz: number | null;
  gpuUsagePct: number | null;
  gpu3dEnginePct: number | null;
  gpuCopyEnginePct: number | null;
  gpuVideoEnginePct: number | null;
  gpuPowerW: number | null;
  gpuTempC: number | null;
  gpuThermalLimitActive: boolean | null;
  gpuPowerLimitActive: boolean | null;
  gpuSharedMemoryUsedMb: number | null;
  ramUsedMb: number | null;
  ramLoadPct: number | null;
  pageFileUsagePct: number | null;
  memoryClockMhz: number | null;
  isSimulated: boolean;
  rawLineNumber: number;
  parseWarnings: string[];
}

export interface SynchronizedTelemetryPoint {
  windowIndex: number;
  timeSeconds: number;
  timestampUtc: string;
  sourcePresentMon: string;
  sourceHwinfo: string;
  isSimulated: boolean;
  temporalDeltaMs: number | null;
  hasPresentMonData: boolean;
  hasHwinfoData: boolean;
  // Presentation & Frametime (window-aggregated from PresentMon)
  fpsInstant: number | null;
  displayedFpsInstant: number | null;
  frametimeMs: number | null;
  frametimeP99WindowMs: number | null;
  msBetweenDisplayChange: number | null;
  msUntilDisplayed: number | null;
  msInPresentApi: number | null;
  cpuBusyMs: number | null;
  cpuWaitMs: number | null;
  gpuBusyMs: number | null;
  gpuWaitMs: number | null;
  presentMode: string | null;
  syncInterval: number | null;
  allowsTearing: boolean | null;
  droppedFramesCount: number;
  repeatedFramesCount: number;
  tearingRiskActive: boolean;
  stutterEventActive: boolean;
  // Hardware sensors (aligned from HWiNFO64)
  gpuClockMhz: number | null;
  gpuUsagePct: number | null;
  gpu3dEnginePct: number | null;
  gpuCopyEnginePct: number | null;
  gpuVideoEnginePct: number | null;
  gpuPowerW: number | null;
  gpuTempC: number | null;
  cpuUsageTotalPct: number | null;
  cpuMaxThreadUsagePct: number | null;
  cpuNominalClockMhz: number | null;
  cpuEffectiveClockMhz: number | null;
  cpuTempC: number | null;
  cpuPackagePowerW: number | null;
  cpuPl1W: number | null;
  cpuPl2W: number | null;
  cpuThermalThrottling: boolean | null;
  cpuPowerLimitThrottling: boolean | null;
  cpuProchotActive: boolean | null;
  ramUsedMb: number | null;
  ramLoadPct: number | null;
  pageFileUsagePct: number | null;
}

export interface StutterEvent {
  eventIndex: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  durationMs: number;
  peakFrametimeMs: number;
  localMedianFrametimeMs: number;
  ratioToMedian: number;
  concurrentCpuTempC: number | null;
  concurrentCpuEffectiveMhz: number | null;
  concurrentGpuClockMhz: number | null;
  concurrentGpuBusyPct: number | null;
  concurrentCpuMaxThreadPct: number | null;
  concurrentThermalThrottle: boolean | null;
  concurrentPowerThrottle: boolean | null;
  probableTrigger: string;
}

export interface FrametimeStats {
  sampleCount: number;
  validFrameCount: number;
  missingFrameCount: number;
  durationSeconds: number;
  insufficientSamples: boolean;
  insufficientReason?: string;
  avgFps: number | null;
  minFps: number | null;
  maxFps: number | null;
  fps1PercentLow: number | null;
  fps0_1PercentLow: number | null;
  avgFrametimeMs: number | null;
  minFrametimeMs: number | null;
  maxFrametimeMs: number | null;
  p50FrametimeMs: number | null;
  p95FrametimeMs: number | null;
  p99FrametimeMs: number | null;
  p99_9FrametimeMs: number | null;
  stdDevFrametimeMs: number | null;
  stutterEventsCount: number;
  totalStutterDurationMs: number;
  stutterEvents: StutterEvent[];
  droppedFramesTotal: number;
  repeatedFramesTotal: number;
  pctTimeGpuAbove1100Mhz: number | null;
  pctTimeGpuAbove1300Mhz: number | null;
  gpuClockMinMhz: number | null;
  gpuClockAvgMhz: number | null;
  gpuClockMaxMhz: number | null;
  gpuClockP50Mhz: number | null;
  gpuClockP95Mhz: number | null;
  methodologyNotes: string[];
}

export interface CorrelationPairResult {
  id: string;
  metricA: string;
  metricB: string;
  unitA: string;
  unitB: string;
  sampleCount: number;
  pearsonR: number | null;
  strengthLabel: string;
  technicalInterpretation: string;
  causalityWarning: string;
}

export interface DiagnosticFinding {
  id: string;
  title: string;
  category:
    | 'GPU Iris Xe'
    | 'CPU & Energia'
    | 'Memória & Largura de Banda'
    | 'Apresentação & Screen Tearing'
    | 'VRR & Sincronização do Monitor'
    | 'Driver & Sistema Operacional';
  severity: 'critical' | 'warning' | 'info' | 'normal';
  confidence: ConfidenceLevel;
  whatHappened: string;
  whenHappened: string;
  primaryIndicatorChanged: string;
  simultaneousIndicators: string[];
  compatibleHypotheses: string[];
  discardedHypotheses: string[];
  supportingEvidence: string[];
  confirmatoryTest: string;
}

export interface SafeRecommendation {
  id: string;
  title: string;
  category: string;
  priority: 'Alta' | 'Média' | 'Baixa (Investigativa)';
  observedProblem: string;
  evidence: string;
  suggestedAction: string;
  expectedBenefit: string;
  risk: string;
  howToUndo: string;
  howToMeasureImprovement: string;
}

export interface PresentationChainStage {
  stageNumber: number;
  name: string;
  component: string;
  measuredIndicator: string;
  currentValue: string;
  status: 'normal' | 'bottleneck' | 'warning' | 'unmeasured';
  technicalDetail: string;
}

export interface VrrThreeTierAssessment {
  edidAnnouncedSupport: {
    status: 'Suportado no EDID' | 'Não anunciado no EDID' | 'Não verificado (sem dump EDID)';
    rangeHz: string;
    connectionType: string;
    detail: string;
  };
  driverAndOsSupport: {
    status: 'Habilitado no Driver/Windows' | 'Desabilitado ou Não Suportado via HDMI' | 'Indeterminado';
    dxgiAllowTearing: boolean | null;
    windowsDrrStatus: string;
    detail: string;
  };
  effectiveRuntimeOperation: {
    status: 'Ativo (Refresh Variável Medido)' | 'Inativo (Scanout Fixo 100 Hz / 10,0 ms)' | 'Amostras Insuficientes';
    measuredDisplayChangeStdDevMs: number | null;
    quantizedTo10msPct: number | null;
    detail: string;
  };
  overallConclusion: string;
}

export interface DiagnosticSession {
  id: string;
  name: string;
  stageType: 'Repouso' | 'Aquecimento Controlado' | 'Sessão de Jogo (Valorant)' | 'Repetição / Comparação A/B';
  createdAtUtc: string;
  isSimulated: boolean;
  simulationNotice?: string;
  hardwareProfileId: string;
  driverVersion: string;
  osVersion: string;
  resolution: string;
  monitorRefreshHz: number;
  powerPlan: string;
  windowMode: 'Tela Cheia Exclusiva (Fullscreen)' | 'Sem Bordas (Borderless Windowed)' | 'Janela';
  vsyncConfigured: boolean;
  fpsLimitConfigured: number | null;
  vrrConfigured: boolean;
  telemetrySources: string[];
  presentMonFrames: PresentMonFrameRow[];
  hwinfoSamples: HwinfoSensorRow[];
  synchronizedStream: SynchronizedTelemetryPoint[];
  stats: FrametimeStats;
  correlations: CorrelationPairResult[];
  findings: DiagnosticFinding[];
  recommendations: SafeRecommendation[];
  vrrAssessment: VrrThreeTierAssessment;
  presentationChain: PresentationChainStage[];
  parseNotes: string[];
}
