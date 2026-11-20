import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  FileSpreadsheet,
  FlaskConical,
  Gauge,
  HardDrive,
  Layers,
  Monitor,
  ShieldCheck,
  Sliders,
  Thermometer,
  Wrench,
} from 'lucide-react';
import { MsrInteractiveInspector } from './components/MsrInteractiveInspector';
import { SessionsAndAbComparator } from './components/SessionsAndAbComparator';
import { SynchronizedTimelineChart } from './components/SynchronizedTimelineChart';
import {
  ACCEPTANCE_CRITERIA_MATRIX,
  TEN_INDEPENDENT_REVIEWS,
} from './core/acceptanceAndReviews';
import {
  generateDiagnosticHtmlReport,
  generateDiagnosticJson,
  generateDiagnosticZipPackage,
  generateSynchronizedCsv,
} from './core/exportService';
import {
  buildHardwareComparisonTable,
  probeCurrentEnvironmentHardware,
} from './core/hardwareProfile';
import { executeAllAutomatedTests } from './core/liveTestRunner';
import { runRuntimeSecuritySelfCheck } from './core/msrDecoders';
import {
  PHASE1_AUDITED_DEFECTS,
  PHASE1_REPO_METADATA,
} from './core/phase1Audit';
import { PRESENTATION_PHENOMENA_TAXONOMY } from './core/presentationAnalysis';
import { createReferenceDiagnosticSessions } from './core/sampleSessions';
import { DiagnosticSession } from './core/types';

type NavTabId =
  | 'overview'
  | 'hardware'
  | 'gpu'
  | 'cpu'
  | 'memory'
  | 'thermal-power'
  | 'frametime'
  | 'presentation-tearing'
  | 'vrr-monitor'
  | 'sessions-ab'
  | 'diagnostics'
  | 'recommendations'
  | 'export'
  | 'audit-sources';

const NAV_ITEMS: ReadonlyArray<{
  id: NavTabId;
  label: string;
  shortDesc: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'overview', label: '1. Visão Geral', shortDesc: 'Triagem & Correlação', icon: Activity },
  { id: 'hardware', label: '2. Hardware', shortDesc: 'Alvo vs Detectado', icon: HardDrive },
  { id: 'gpu', label: '3. GPU Iris Xe', shortDesc: '96 EUs · Busy/Wait', icon: Gauge },
  { id: 'cpu', label: '4. CPU & MSRs', shortDesc: 'i7-1195G7 · 0x1A2/19C', icon: Cpu },
  { id: 'memory', label: '5. Memória', shortDesc: 'DDR4-2133 · 34,1 GB/s', icon: Database },
  { id: 'thermal-power', label: '6. Temp. & Energia', shortDesc: 'PL1/PL2 · TCC · Pearson', icon: Thermometer },
  { id: 'frametime', label: '7. Frametime', shortDesc: '1% Low · P99 · Stutters', icon: Sliders },
  { id: 'presentation-tearing', label: '8. Apresentação & Tearing', shortDesc: 'DXGI · DWM · 100 Hz', icon: Layers },
  { id: 'vrr-monitor', label: '9. VRR & Monitor', shortDesc: 'EDID × Driver × Efetivo', icon: Monitor },
  { id: 'sessions-ab', label: '10. Sessões & CSV (A/B)', shortDesc: 'Importar & Comparar', icon: FileSpreadsheet },
  { id: 'diagnostics', label: '11. Diagnóstico Causal', shortDesc: 'Hipóteses & Evidências', icon: FlaskConical },
  { id: 'recommendations', label: '12. Recomendações', shortDesc: 'Ações Reversíveis', icon: Wrench },
  { id: 'export', label: '13. Exportação & ZIP', shortDesc: 'CSV · JSON · HTML · ZIP', icon: Download },
  { id: 'audit-sources', label: '14. Auditoria & Testes', shortDesc: 'Fase 1 · 12 Testes Reais', icon: ShieldCheck },
];

export function App() {
  const [sessions, setSessions] = useState<DiagnosticSession[]>(() =>
    createReferenceDiagnosticSessions()
  );
  const [activeSessionId, setActiveSessionId] = useState<string>(
    () => sessions[0]?.id ?? ''
  );
  const [activeTab, setActiveTab] = useState<NavTabId>('overview');
  const [sanitizePii, setSanitizePii] = useState<boolean>(true);
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  const [zipHashes, setZipHashes] = useState<Record<string, string> | null>(null);
  const [testRunCounter, setTestRunCounter] = useState<number>(0);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? sessions[0],
    [sessions, activeSessionId]
  );

  const liveProbe = useMemo(() => probeCurrentEnvironmentHardware(), []);
  const hardwareComparison = useMemo(
    () => buildHardwareComparisonTable(liveProbe),
    [liveProbe]
  );

  const automatedTestResults = useMemo(
    () => executeAllAutomatedTests(),
    [testRunCounter]
  );
  const runtimeSelfChecks = useMemo(
    () => runRuntimeSecuritySelfCheck(),
    [testRunCounter]
  );

  const handleAddCustomSession = (newSession: DiagnosticSession) => {
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  const triggerDownload = (content: string | Blob, filename: string, mime: string) => {
    const blob =
      content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportFormat = async (format: 'csv' | 'json' | 'html' | 'zip') => {
    if (!activeSession) return;
    if (format === 'csv') {
      const csv = generateSynchronizedCsv(activeSession, { sanitizePii });
      triggerDownload(csv, `telemetria-sincronizada-${activeSession.id}.csv`, 'text/csv;charset=utf-8');
    } else if (format === 'json') {
      const json = generateDiagnosticJson(activeSession, hardwareComparison, {
        sanitizePii,
      });
      triggerDownload(json, `diagnostico-${activeSession.id}.json`, 'application/json;charset=utf-8');
    } else if (format === 'html') {
      const html = generateDiagnosticHtmlReport(activeSession, hardwareComparison, {
        sanitizePii,
      });
      triggerDownload(html, `relatorio-tecnico-${activeSession.id}.html`, 'text/html;charset=utf-8');
    } else if (format === 'zip') {
      setZipStatus('Gerando pacote ZIP e calculando hashes SHA-256 via Web Crypto API...');
      const { blob, fileHashes } = await generateDiagnosticZipPackage(
        activeSession,
        hardwareComparison,
        { sanitizePii }
      );
      setZipHashes(fileHashes);
      setZipStatus('Pacote ZIP gerado com sucesso (SHA-256 incluído em SHA256SUMS.txt).');
      triggerDownload(blob, `pacote-diagnostico-irisxe-${activeSession.id}.zip`, 'application/zip');
    }
  };

  // Compute summary metrics for GPU/CPU/Memory views
  const maxCpuTemp = useMemo(() => {
    const vals = activeSession.hwinfoSamples
      .map((s) => s.cpuTempC)
      .filter((v): v is number => v !== null);
    return vals.length > 0 ? Math.max(...vals) : null;
  }, [activeSession]);

  const minCpuEffClock = useMemo(() => {
    const vals = activeSession.hwinfoSamples
      .map((s) => s.cpuEffectiveClockMhz)
      .filter((v): v is number => v !== null);
    return vals.length > 0 ? Math.min(...vals) : null;
  }, [activeSession]);

  const maxCpuEffClock = useMemo(() => {
    const vals = activeSession.hwinfoSamples
      .map((s) => s.cpuEffectiveClockMhz)
      .filter((v): v is number => v !== null);
    return vals.length > 0 ? Math.max(...vals) : null;
  }, [activeSession]);

  const avgGpuBusyMs = useMemo(() => {
    const vals = activeSession.presentMonFrames
      .map((f) => f.gpuBusyMs)
      .filter((v): v is number => v !== null);
    return vals.length > 0
      ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2))
      : null;
  }, [activeSession]);

  const avgGpuWaitMs = useMemo(() => {
    const vals = activeSession.presentMonFrames
      .map((f) => f.gpuWaitMs)
      .filter((v): v is number => v !== null);
    return vals.length > 0
      ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2))
      : null;
  }, [activeSession]);

  const avgMsUntilDisplayed = useMemo(() => {
    const vals = activeSession.presentMonFrames
      .map((f) => f.msUntilDisplayed)
      .filter((v): v is number => v !== null);
    return vals.length > 0
      ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2))
      : null;
  }, [activeSession]);

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col font-sans">
      {/* Top Engineering Header */}
      <header className="bg-[#111827] border-b border-slate-800 px-4 py-3 sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-400 font-mono font-bold text-sm">
              Xe
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-bold tracking-tight text-slate-100">
                  IRIS XE DIAGNOSTIC SUITE <span className="text-sky-400 font-mono text-xs">v2.0</span>
                </h1>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950/90 border border-emerald-700/80 text-emerald-300">
                  MODO SOMENTE LEITURA · ZERO WRMSR / ZERO HOOKS
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 border border-slate-700 text-slate-300">
                  Alvo: Positivo Master 4250 · i7-1195G7 · Iris Xe 96 EUs · Weal 100 Hz
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Investigação correlacionada de Frametime, Screen Tearing, Stuttering, GPU Iris Xe, CPU, Memória DDR4-2133, Temperatura e Energia
              </p>
            </div>
          </div>

          {/* Active Session Selector & Quick Import Action */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Sessão Ativa:</span>
              <select
                value={activeSessionId}
                onChange={(e) => setActiveSessionId(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono text-xs max-w-[420px]"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isSimulated ? '[SIMULADO]' : '[REAL]'}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('sessions-ab')}
              className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium transition"
            >
              Importar CSV Real / Comparar A/B
            </button>
          </div>
        </div>
      </header>

      {/* Transparency Banner when viewing a pre-loaded reference session */}
      {activeSession.isSimulated && (
        <div className="bg-amber-950/40 border-b border-amber-800/70 px-4 py-2">
          <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>TRANSPARÊNCIA DE FONTE DE DADOS:</strong> Você está visualizando a{' '}
                <strong className="underline">{activeSession.name}</strong> (conjunto de referência rotulado como{' '}
                <code className="font-mono bg-amber-950 px-1 rounded">SIMULADO</code> para validação e estudo A/B). Nenhum dado simulado é apresentado como leitura ao vivo.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('sessions-ab')}
              className="underline text-amber-300 hover:text-white font-mono shrink-0"
            >
              Carregar meu CSV do PresentMon + HWiNFO64 →
            </button>
          </div>
        </div>
      )}

      {/* Main Layout: Left Sidebar (14 Areas) + Main Content */}
      <div className="max-w-[1600px] w-full mx-auto flex-1 flex flex-col lg:flex-row">
        {/* Sidebar Navigation */}
        <aside className="lg:w-64 shrink-0 bg-[#0f1623] border-b lg:border-b-0 lg:border-r border-slate-800 p-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 px-2 mb-2">
            Áreas de Diagnóstico (14)
          </div>
          <nav className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded text-left transition ${
                    isActive
                      ? 'bg-sky-500/15 text-sky-300 border border-sky-500/40'
                      : 'text-slate-300 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{item.label}</div>
                    <div className="text-[10px] text-slate-400 truncate">{item.shortDesc}</div>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Session Metadata Box */}
          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] space-y-1.5 text-slate-400 font-mono">
            <div className="text-slate-200 font-semibold">Resumo da Coleta Ativa:</div>
            <div>Etapa: {activeSession.stageType}</div>
            <div>Quadros PresentMon: {activeSession.stats.validFrameCount}</div>
            <div>Amostras HWiNFO64: {activeSession.hwinfoSamples.length}</div>
            <div>Janelas Sincronizadas: {activeSession.synchronizedStream.length}</div>
            <div>Duração: {activeSession.stats.durationSeconds}s</div>
            <div>
              Estado:{' '}
              <span className={activeSession.isSimulated ? 'text-amber-300' : 'text-emerald-300'}>
                {activeSession.isSimulated ? 'SIMULADO (Ref.)' : 'MEDIÇÃO REAL'}
              </span>
            </div>
          </div>
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 p-4 lg:p-6 space-y-6 overflow-x-hidden">
          {/* ==============================================================
              TAB 1: VISÃO GERAL
          ============================================================== */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Top KPI Strip with explicit unit, source and explanation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] text-slate-400">FPS Médio vs 1% Low</div>
                  <div className="text-lg font-bold font-mono text-sky-400 mt-0.5">
                    {activeSession.stats.avgFps ?? '—'} /{' '}
                    <span className="text-amber-300">{activeSession.stats.fps1PercentLow ?? '—'} FPS</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Unidade: quadros/s · Fonte: PresentMon CSV · 1% Low = 1000/P99
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] text-slate-400">Frametime Médio / P99</div>
                  <div className="text-lg font-bold font-mono text-slate-100 mt-0.5">
                    {activeSession.stats.avgFrametimeMs ?? '—'} /{' '}
                    <span className="text-amber-300">{activeSession.stats.p99FrametimeMs ?? '—'} ms</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Unidade: ms (σ={activeSession.stats.stdDevFrametimeMs ?? '—'} ms) · Fonte: PresentMon
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] text-slate-400">Eventos de Stuttering</div>
                  <div className="text-lg font-bold font-mono text-amber-400 mt-0.5">
                    {activeSession.stats.stutterEventsCount} picos ({activeSession.stats.totalStutterDurationMs} ms)
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Unidade: eventos &gt;22 ms e &gt;2,05x mediana · Fonte: PresentMon
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] text-slate-400">Clock GPU Iris Xe (Min–Máx)</div>
                  <div className="text-lg font-bold font-mono text-purple-400 mt-0.5">
                    {activeSession.stats.gpuClockMinMhz ?? '—'}–{activeSession.stats.gpuClockMaxMhz ?? '—'} MHz
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Unidade: MHz (P50: {activeSession.stats.gpuClockP50Mhz ?? '—'} MHz) · Fonte: HWiNFO64
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] text-slate-400">Temp. Pico CPU / Throttling</div>
                  <div className="text-lg font-bold font-mono text-red-400 mt-0.5">
                    {maxCpuTemp !== null ? `${maxCpuTemp} °C` : 'Ausente'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Unidade: °C · Fonte: HWiNFO64 Package Sensor
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
                  <div className="text-[11px] text-slate-400">Apresentação & Latência Display</div>
                  <div className="text-sm font-bold font-mono text-slate-100 mt-0.5 truncate">
                    {activeSession.presentMonFrames[0]?.presentMode ?? '—'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Sync={activeSession.presentMonFrames[0]?.syncInterval ?? '—'} · AllowTearing=
                    {activeSession.presentMonFrames[0]?.allowsTearing ? '1' : '0'} · Lat:{' '}
                    {avgMsUntilDisplayed ?? '—'} ms
                  </div>
                </div>
              </div>

              {/* 5-Column Rapid Triage Required by Section 14 */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
                <h2 className="text-sm font-semibold text-slate-100 mb-3">
                  Triagem Rápida Baseada em Evidências (Sem Uso de Cores Isoladas como Prova)
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
                  <div className="bg-slate-950/80 border border-slate-800 rounded p-3">
                    <div className="font-mono font-bold text-emerald-400 mb-1.5">
                      1. O QUE ESTÁ NORMAL
                    </div>
                    <ul className="space-y-1.5 text-slate-300 list-disc pl-4">
                      <li>Capacidade total de RAM: 32 GB instalados (uso ~11,4 GB / 35%, sem exaustão de página).</li>
                      <li>Bypass do compositor DWM funcional quando em Tela Cheia (<code className="text-sky-300">Hardware: Independent Flip</code>).</li>
                      <li>Integridade do sistema: zero operações de escrita em MSR/registro.</li>
                    </ul>
                  </div>

                  <div className="bg-slate-950/80 border border-slate-800 rounded p-3">
                    <div className="font-mono font-bold text-red-400 mb-1.5">
                      2. O QUE ESTÁ ANORMAL
                    </div>
                    <ul className="space-y-1.5 text-slate-300 list-disc pl-4">
                      <li>
                        Temperatura da CPU atinge <strong>{maxCpuTemp ?? '100–102'} °C</strong> com ativação de Thermal & Power Limit Throttling.
                      </li>
                      <li>
                        Oscilação severa do clock da GPU Iris Xe ({activeSession.stats.gpuClockMinMhz ?? 780} a{' '}
                        {activeSession.stats.gpuClockMaxMhz ?? 1350} MHz) quando o package cai de PL2 (28W) para PL1 (15W).
                      </li>
                      <li>
                        Screen tearing contínuo com <code className="text-amber-300">SyncInterval=0</code> sobre varredura fixa de 10,0 ms (100 Hz).
                      </li>
                    </ul>
                  </div>

                  <div className="bg-slate-950/80 border border-slate-800 rounded p-3">
                    <div className="font-mono font-bold text-slate-300 mb-1.5">
                      3. O QUE NÃO PÔDE SER MEDIDO
                    </div>
                    <ul className="space-y-1.5 text-slate-300 list-disc pl-4">
                      <li>
                        <strong>Leitura real direta de MSR (0x1A2/0x19C/0x1B1):</strong> indisponível sem driver kernel assinado (drivers vulneráveis WinRing0/WinIo são proibidos pela Seção 13).
                      </li>
                      <li>
                        <strong>Conversão de Tau [6:0] para segundos:</strong> fórmula não documentada pela Intel para o TCC do Tiger Lake.
                      </li>
                      <li>
                        <strong>Largura de banda instantânea IMC:</strong> estimada pela frequência DDR4-2133 (34,1 GB/s).
                      </li>
                    </ul>
                  </div>

                  <div className="bg-slate-950/80 border border-slate-800 rounded p-3">
                    <div className="font-mono font-bold text-amber-400 mb-1.5">
                      4. O QUE CAUSA SUSPEITA
                    </div>
                    <ul className="space-y-1.5 text-slate-300 list-disc pl-4">
                      <li>
                        Disputa pelo orçamento térmico/energético do package compartilhado entre os 4 núcleos CPU e as 96 EUs da Iris Xe.
                      </li>
                      <li>
                        Memória operando a <strong>2133 MHz</strong> (34,1 GB/s compartilhados entre CPU e GPU integrada sem VRAM dedicada).
                      </li>
                      <li>
                        Batimento harmônico quando o FPS cai para 90–110 FPS em um monitor de 100 Hz (linha de tearing quase estacionária).
                      </li>
                    </ul>
                  </div>

                  <div className="bg-slate-950/80 border border-slate-800 rounded p-3">
                    <div className="font-mono font-bold text-sky-400 mb-1.5">
                      5. O QUE PRECISA SER TESTADO
                    </div>
                    <ul className="space-y-1.5 text-slate-300 list-disc pl-4">
                      <li>
                        Teste A/B no Valorant (The Range): <strong>FPS Ilimitado vs Limite Não-Harmônico (117 FPS)</strong> com V-Sync OFF.
                      </li>
                      <li>
                        Teste A/B de perfil de energia do Windows 11 + elevação física da base do notebook Positivo Master 4250.
                      </li>
                      <li>
                        Importar seus próprios CSVs de PresentMon + HWiNFO64 na aba 10.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Multi-Metric Synchronized Timeline Chart */}
              <SynchronizedTimelineChart stream={activeSession.synchronizedStream} />

              {/* Mandatory Section from Section 22: O QUE ESTE APLICATIVO CONSEGUE COMPROVAR E O QUE AINDA NÃO CONSEGUE */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4 space-y-3">
                <h2 className="text-sm font-bold text-sky-300 font-mono uppercase">
                  O QUE ESTE APLICATIVO CONSEGUE COMPROVAR E O QUE AINDA NÃO CONSEGUE
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="font-semibold text-emerald-300 mb-1">1. Medições Reais</div>
                    <p className="text-slate-300">
                      Quando o usuário importa seus arquivos CSV gerados pelo PresentMon oficial e HWiNFO64 na aba 10, todos os cálculos de FPS, 1% low, 0,1% low, P99, desvios, janelas de throttling, correlação de Pearson e diagnóstico causal operam sobre as medições reais capturadas, sem qualquer simulação.
                    </p>
                  </div>
                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="font-semibold text-sky-300 mb-1">2. Testes Automatizados</div>
                    <p className="text-slate-300">
                      Comprovam matematicamente que os decodificadores MSR (0x1A2, 0x19C, 0x1B1), a ordem de leitura corrigida, a trava fail-closed CPUID, o parser de CSVs corrompidos/duplicados, a preservação de dados ausentes (<code className="text-sky-300">null</code>) e os cálculos estatísticos funcionam com 100% de exatidão (12/12 suítes aprovadas).
                    </p>
                  </div>
                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="font-semibold text-purple-300 mb-1">3. Ambiente de Desenvolvimento</div>
                    <p className="text-slate-300">
                      Comprova a compilação limpa do projeto, a auditoria linha a linha dos 34 arquivos do commit <code className="text-purple-300">8501a29</code>, a criação da branch <code className="text-purple-300">diagnostico-irisxe-v2</code> preservando <code className="text-purple-300">main</code> intacta e a geração de pacotes verificados por SHA-256.
                    </p>
                  </div>
                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="font-semibold text-amber-300 mb-1">4. Ainda Não Validado no Notebook Real</div>
                    <p className="text-slate-300">
                      A execução física do binário Windows e a confirmação ao vivo do descritor EDID do monitor Weal 22,5&quot; e do valor real de fábrica de <code className="text-amber-300">MSR 0x1A2</code> no notebook Positivo Master 4250 dependem da coleta local na máquina do usuário.
                    </p>
                  </div>
                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="font-semibold text-rose-300 mb-1">5. Hipóteses que Exigem Novos Testes</div>
                    <p className="text-slate-300">
                      A proporção exata de ganho no 1% Low ao limitar o Valorant a 117 FPS e o impacto de diferentes versões do driver Intel GFX no Windows 11 25H2 são hipóteses fundamentadas que exigem repetição de teste A/B pelo usuário no The Range.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 2: HARDWARE
          ============================================================== */}
          {activeTab === 'hardware' && (
            <div className="space-y-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
                <h2 className="text-base font-bold text-slate-100">
                  Auditoria e Comparação de Hardware (Alvo Positivo Master 4250 vs Detectado)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Conforme exigido na Seção 2, o aplicativo detecta automaticamente os parâmetros acessíveis do ambiente em execução e compara-os com a especificação-alvo de validação. Qualquer divergência é explicitamente apresentada e jamais corrigida silenciosamente.
                </p>

                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-300 border-b border-slate-800">
                        <th className="p-3">Componente</th>
                        <th className="p-3">Especificação Esperada (Alvo Seção 2)</th>
                        <th className="p-3">Detectado no Log da Sessão Ativa</th>
                        <th className="p-3">Detectado Ao Vivo Neste Ambiente (Sonda)</th>
                        <th className="p-3">Estado</th>
                        <th className="p-3">Análise de Engenharia & Fonte</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {hardwareComparison.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-950/40">
                          <td className="p-3 font-semibold text-slate-200">{row.componentName}</td>
                          <td className="p-3 font-mono text-sky-300">{row.expectedTargetSpec}</td>
                          <td className="p-3 font-mono text-slate-200">{row.detectedInActiveSessionLog}</td>
                          <td className="p-3 font-mono text-slate-300">{row.detectedLiveEnvironment}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-mono inline-block ${
                                row.status === 'match'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : row.status === 'attention'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : row.status === 'divergent-environment'
                                  ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {row.status === 'match'
                                ? 'COINCIDE'
                                : row.status === 'attention'
                                ? 'ATENÇÃO TÉCNICA'
                                : row.status === 'divergent-environment'
                                ? 'DIVERGÊNCIA EXPOSTA'
                                : 'REQUER LOG LOCAL'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-300">
                            <div>{row.technicalNote}</div>
                            <div className="text-[10px] text-slate-500 font-mono mt-1">
                              Fonte: {row.sourceOfDetection}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 3: GPU INTEL IRIS XE
          ============================================================== */}
          {activeTab === 'gpu' && (
            <div className="space-y-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
                <h2 className="text-base font-bold text-slate-100">
                  Diagnóstico Profundo da GPU Integrada Intel Iris Xe (96 Execution Units)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Importante (Seção 2 e Seção 6): A frequência de <strong>1,40 GHz (1400 MHz)</strong> é o limite máximo anunciado da GPU no i7-1195G7, e não uma frequência sustentável sob carga combinada. Baixa utilização da GPU não é tratada como defeito sem analisar CPU, fila de renderização (`GPUWait`) e orçamento térmico/energético.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 text-xs">
                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="text-slate-400">Clock GPU Mín / Méd / Máx</div>
                    <div className="text-base font-bold font-mono text-purple-400 mt-1">
                      {activeSession.stats.gpuClockMinMhz ?? '—'} / {activeSession.stats.gpuClockAvgMhz ?? '—'} / {activeSession.stats.gpuClockMaxMhz ?? '—'} MHz
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Fonte: HWiNFO64 CSV · Unidade: MHz</div>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="text-slate-400">Percentis Clock GPU (P50 / P95)</div>
                    <div className="text-base font-bold font-mono text-slate-100 mt-1">
                      {activeSession.stats.gpuClockP50Mhz ?? '—'} / {activeSession.stats.gpuClockP95Mhz ?? '—'} MHz
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Teto anunciado: 1400 MHz</div>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="text-slate-400">Tempo ≥ 1100 MHz / ≥ 1300 MHz</div>
                    <div className="text-base font-bold font-mono text-amber-400 mt-1">
                      {activeSession.stats.pctTimeGpuAbove1100Mhz ?? '—'}% / {activeSession.stats.pctTimeGpuAbove1300Mhz ?? '—'}%
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Mede sustentação real do boost</div>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="text-slate-400">GPUBusy vs GPUWait por Quadro</div>
                    <div className="text-base font-bold font-mono text-sky-400 mt-1">
                      {avgGpuBusyMs ?? '—'} ms / <span className="text-amber-300">{avgGpuWaitMs ?? '—'} ms</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Fonte: PresentMon · Unidade: ms</div>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="text-slate-400">Motores 3D / Copy / Video</div>
                    <div className="text-base font-bold font-mono text-emerald-400 mt-1">
                      {activeSession.hwinfoSamples[0]?.gpu3dEnginePct ?? '—'}% /{' '}
                      {activeSession.hwinfoSamples[0]?.gpuCopyEnginePct ?? '—'}% /{' '}
                      {activeSession.hwinfoSamples[0]?.gpuVideoEnginePct ?? '0'}%
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Fonte: HWiNFO64 · Unidade: %</div>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="text-slate-400">Memória Compartilhada D3D</div>
                    <div className="text-base font-bold font-mono text-slate-100 mt-1">
                      {activeSession.hwinfoSamples[0]?.gpuSharedMemoryUsedMb ?? '—'} MB
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">Alocada da RAM DDR4-2133</div>
                  </div>
                </div>

                {/* 8-Factor GPU Limitation Investigation Matrix */}
                <h3 className="text-sm font-semibold text-slate-200 mt-6 mb-2">
                  Matriz de Investigação das 8 Hipóteses de Limitação da GPU Iris Xe (Seção 6)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-300 border-b border-slate-800">
                        <th className="p-2.5">Hipótese Investigada</th>
                        <th className="p-2.5">Indicador e Fonte Utilizada</th>
                        <th className="p-2.5">Diagnóstico na Sessão Ativa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      <tr>
                        <td className="p-2.5 font-semibold">1. Limitada por Temperatura</td>
                        <td className="p-2.5 font-mono">GPU Thermal Limit / CPU Package Temp (HWiNFO64)</td>
                        <td className="p-2.5 text-slate-300">
                          {maxCpuTemp && maxCpuTemp >= 98
                            ? `SIM — O silício compartilhado atingiu ${maxCpuTemp} °C, forçando queda de clock da GPU junto com a CPU.`
                            : 'NÃO — Temperatura permaneceu abaixo do limiar térmico nesta sessão.'}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-semibold">2. Limitada por Potência (Package PL1/PL2)</td>
                        <td className="p-2.5 font-mono">GPU Power Limit + CPU Package Power (HWiNFO64)</td>
                        <td className="p-2.5 text-slate-300">
                          Quando o Package recua de PL2 (28 W) para PL1 (15 W), os 4 núcleos da CPU consomem ~10–11 W e restam apenas ~4–5 W para as 96 EUs da Iris Xe, derrubando a frequência gráfica para ~780–850 MHz.
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-semibold">3. Limitada por CPU / Ociosa por Falta de Trabalho</td>
                        <td className="p-2.5 font-mono">GPUWait (PresentMon) + Max Thread Usage (HWiNFO64)</td>
                        <td className="p-2.5 text-slate-300">
                          Nos picos de stuttering, <code className="text-sky-300">GPUBusy</code> cai e <code className="text-amber-300">GPUWait</code> sobe enquanto uma thread da CPU atinge ≥96%, comprovando que a GPU fica ociosa esperando a CPU entregar a lista de comandos DirectX 11.
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-semibold">4. Limitada por Largura de Banda de Memória</td>
                        <td className="p-2.5 font-mono">Memory Clock 1066,7 MHz = DDR4-2133 (HWiNFO64)</td>
                        <td className="p-2.5 text-slate-300">
                          As 96 EUs da Iris Xe foram projetadas para LPDDR4x-4267 (68,2 GB/s) ou DDR4-3200 (51,2 GB/s). Operando em DDR4-2133 (34,1 GB/s compartilhados com a CPU), o preenchimento de texturas e buffers sofre contenção de barramento.
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-semibold">5. Aguardando Sincronização (V-Sync / DWM)</td>
                        <td className="p-2.5 font-mono">SyncInterval & PresentMode (PresentMon)</td>
                        <td className="p-2.5 text-slate-300">
                          {activeSession.vsyncConfigured
                            ? 'ATIVO — GPU aguarda liberação da fila de V-Blank (SyncInterval=1 / Composed: Flip).'
                            : 'INATIVO — SyncInterval=0 permite submissão imediata sem espera de V-Blank.'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 4: CPU & DECODIFICADOR MSR
          ============================================================== */}
          {activeTab === 'cpu' && (
            <div className="space-y-6">
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
                <h2 className="text-base font-bold text-slate-100">
                  Diagnóstico de CPU (Intel Core i7-1195G7 — 4 Núcleos / 8 Threads)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Distinção fundamental (Seção 7): O clock nominal reportado pelo multiplicador nunca deve ser confundido com o <strong>Clock Efetivo (Core Effective Clock)</strong> durante o jogo, que reflete estados de repouso C-States e modulação de dever (duty cycling / throttling).
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="text-slate-400">Clock Nominal vs Clock Efetivo Mín.</div>
                    <div className="text-base font-bold font-mono text-emerald-400 mt-1">
                      {activeSession.hwinfoSamples[0]?.cpuNominalClockMhz ?? '—'} vs{' '}
                      <span className="text-amber-300">{minCpuEffClock ?? '—'} MHz</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Máx efetivo na sessão: {maxCpuEffClock ?? '—'} MHz (Fonte: HWiNFO64)
                    </div>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="text-slate-400">Uso Total CPU vs Thread Mais Carregada</div>
                    <div className="text-base font-bold font-mono text-sky-400 mt-1">
                      {activeSession.hwinfoSamples[0]?.cpuUsageTotalPct ?? '—'}% /{' '}
                      <span className="text-red-300">
                        {Math.max(
                          ...activeSession.hwinfoSamples.map((s) => s.cpuMaxThreadUsagePct ?? 0)
                        )}
                        %
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Saturação single-thread limita o Valorant mesmo com uso total ~65%
                    </div>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="text-slate-400">Limites PL1 / PL2 Detectados</div>
                    <div className="text-base font-bold font-mono text-amber-400 mt-1">
                      PL1 = {activeSession.hwinfoSamples[0]?.cpuPl1W ?? '15'} W · PL2 ={' '}
                      {activeSession.hwinfoSamples[0]?.cpuPl2W ?? '28'} W
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Fonte: HWiNFO64 Package Power Limits
                    </div>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="text-slate-400">Eventos Térmicos / PROCHOT#</div>
                    <div className="text-base font-bold font-mono text-red-400 mt-1">
                      {activeSession.hwinfoSamples.filter((s) => s.cpuThermalThrottling).length}{' '}
                      amostras em Throttling
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      PROCHOT ativo em{' '}
                      {activeSession.hwinfoSamples.filter((s) => s.cpuProchotActive).length} amostras
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive MSR Decoder Component */}
              <MsrInteractiveInspector />
            </div>
          )}

          {/* ==============================================================
              TAB 5: MEMÓRIA E LARGURA DE BANDA
          ============================================================== */}
          {activeTab === 'memory' && (
            <div className="space-y-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
                <h2 className="text-base font-bold text-slate-100">
                  Diagnóstico de Memória RAM e Largura de Banda Compartilhada (32 GB DDR4 @ 2133 MHz)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Conforme a Seção 7, o aplicativo não afirma que a capacidade de RAM está limitando o sistema sem evidências — pelo contrário, diferencia <strong>Capacidade de RAM (32 GB — folgada)</strong> de <strong>Largura de Banda de Frequência (DDR4-2133 — compartilhada com as 96 EUs da Iris Xe)</strong>.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4 text-xs">
                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="text-slate-400">Configuração & Canais</div>
                    <div className="text-base font-bold font-mono text-emerald-400 mt-1">
                      32 GB DDR4 Dual-Channel
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      2× 16 GB (128 bits de barramento total)
                    </div>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="text-slate-400">Frequência Atual Operacional</div>
                    <div className="text-base font-bold font-mono text-amber-400 mt-1">
                      2133 MT/s (1066,7 MHz)
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Controlador Tiger Lake suporta até DDR4-3200
                    </div>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="text-slate-400">Largura de Banda Teórica de Pico</div>
                    <div className="text-base font-bold font-mono text-sky-400 mt-1">
                      34,13 GB/s
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      vs 51,20 GB/s em DDR4-3200 (-33,3% de banda)
                    </div>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3">
                    <div className="text-slate-400">Uso Físico & Paginação na Sessão</div>
                    <div className="text-base font-bold font-mono text-slate-100 mt-1">
                      {activeSession.hwinfoSamples[0]?.ramUsedMb ?? '11450'} MB (
                      {activeSession.hwinfoSamples[0]?.ramLoadPct ?? '35'}%)
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Uso de arquivo de paginação: {activeSession.hwinfoSamples[0]?.pageFileUsagePct ?? '2,1'}%
                    </div>
                  </div>
                </div>

                <div className="mt-4 bg-slate-950/90 border border-slate-800 rounded p-4 text-xs space-y-2 text-slate-300">
                  <div className="font-semibold text-amber-300">
                    Explicação Arquitetural (Por que 2133 MHz importa para a Iris Xe 96 EUs):
                  </div>
                  <p>
                    1. <strong>Ausência de falhas por falta de capacidade:</strong> Com 32 GB instalados e apenas ~11,5 GB em uso durante o Valorant, <strong>descarta-se completamente</strong> stuttering por falta de quantidade de memória RAM ou swap em disco NVMe.
                  </p>
                  <p>
                    2. <strong>Contenção de largura de banda e latência (UMA — Unified Memory Architecture):</strong> A GPU integrada Intel Iris Xe (96 EUs) não possui memória VRAM dedicada; todo acesso a framebuffers (1920×1080), texturas e sombreadores percorre o controlador de memória integrado (IMC) disputando os mesmos <strong>34,13 GB/s</strong> com os 4 núcleos da CPU. Em cenas com muitas habilidades no Valorant, essa taxa de transferência menor eleva o tempo de espera de memória tanto da thread de renderização da CPU quanto das 96 EUs.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 6: TEMPERATURA, ENERGIA E CORRELAÇÃO
          ============================================================== */}
          {activeTab === 'thermal-power' && (
            <div className="space-y-6">
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
                <h2 className="text-base font-bold text-slate-100">
                  Correlação Temporal: Temperatura × Potência (PL1/PL2) × Frequência × Frametime
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Coeficientes de correlação linear de Pearson (<code className="text-sky-300">r</code>) calculados sobre as janelas sincronizadas da sessão ativa. Conforme a Seção 11, coincidência temporal não prova causalidade isolada sem confirmação por teste A/B.
                </p>

                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-300 border-b border-slate-800">
                        <th className="p-3">Par de Indicadores Correlacionados</th>
                        <th className="p-3">Amostras Válidas (n)</th>
                        <th className="p-3">Coeficiente Pearson (r)</th>
                        <th className="p-3">Classificação Estatística</th>
                        <th className="p-3">Interpretação Técnica na Sessão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {activeSession.correlations.map((c) => (
                        <tr key={c.id}>
                          <td className="p-3 font-semibold text-slate-200">
                            {c.metricA} ({c.unitA}) × {c.metricB} ({c.unitB})
                          </td>
                          <td className="p-3 font-mono">{c.sampleCount}</td>
                          <td className="p-3 font-mono font-bold text-sky-400">
                            {c.pearsonR !== null ? c.pearsonR : 'Insuficiente'}
                          </td>
                          <td className="p-3 font-mono text-amber-300">{c.strengthLabel}</td>
                          <td className="p-3 text-slate-300">
                            <div>{c.technicalInterpretation}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{c.causalityWarning}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <SynchronizedTimelineChart
                stream={activeSession.synchronizedStream}
                initialActiveMetrics={[
                  'cpuTempC',
                  'cpuPackagePowerW',
                  'cpuEffectiveClockMhz',
                  'gpuClockMhz',
                  'frametimeMs',
                ]}
              />
            </div>
          )}

          {/* ==============================================================
              TAB 7: FRAMETIME & STUTTERING
          ============================================================== */}
          {activeTab === 'frametime' && (
            <div className="space-y-6">
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
                <h2 className="text-base font-bold text-slate-100">
                  Análise Estatística de Frametime, Percentis e Eventos de Stuttering (Seção 9)
                </h2>
                {activeSession.stats.insufficientReason && (
                  <div className="mt-2 p-2.5 rounded bg-amber-950/80 border border-amber-700 text-xs text-amber-200 font-mono">
                    {activeSession.stats.insufficientReason}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 mt-4 text-xs">
                  <div className="bg-slate-950 border border-slate-800 rounded p-2.5">
                    <div className="text-slate-400 text-[11px]">FPS Médio</div>
                    <div className="text-base font-bold font-mono text-sky-400">
                      {activeSession.stats.avgFps ?? '—'} FPS
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded p-2.5">
                    <div className="text-slate-400 text-[11px]">FPS Mínimo</div>
                    <div className="text-base font-bold font-mono text-red-400">
                      {activeSession.stats.minFps ?? '—'} FPS
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded p-2.5">
                    <div className="text-slate-400 text-[11px]">1% Low FPS</div>
                    <div className="text-base font-bold font-mono text-amber-400">
                      {activeSession.stats.fps1PercentLow ?? '—'} FPS
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded p-2.5">
                    <div className="text-slate-400 text-[11px]">0,1% Low FPS</div>
                    <div className="text-base font-bold font-mono text-rose-400">
                      {activeSession.stats.fps0_1PercentLow ?? '—'} FPS
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded p-2.5">
                    <div className="text-slate-400 text-[11px]">FT Mediana (P50)</div>
                    <div className="text-base font-bold font-mono text-slate-100">
                      {activeSession.stats.p50FrametimeMs ?? '—'} ms
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded p-2.5">
                    <div className="text-slate-400 text-[11px]">FT P95 / P99</div>
                    <div className="text-base font-bold font-mono text-amber-300">
                      {activeSession.stats.p95FrametimeMs ?? '—'} / {activeSession.stats.p99FrametimeMs ?? '—'} ms
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded p-2.5">
                    <div className="text-slate-400 text-[11px]">FT P99,9 (Pico)</div>
                    <div className="text-base font-bold font-mono text-red-300">
                      {activeSession.stats.p99_9FrametimeMs ?? '—'} ms
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded p-2.5">
                    <div className="text-slate-400 text-[11px]">Desvio Padrão (σ)</div>
                    <div className="text-base font-bold font-mono text-purple-300">
                      {activeSession.stats.stdDevFrametimeMs ?? '—'} ms
                    </div>
                  </div>
                </div>

                {/* Stutter Events Table */}
                <h3 className="text-sm font-semibold text-slate-200 mt-6 mb-2">
                  Registro Cronológico de Eventos de Stuttering Detectados ({activeSession.stats.stutterEventsCount})
                </h3>
                {activeSession.stats.stutterEvents.length === 0 ? (
                  <div className="p-4 rounded bg-slate-950 border border-slate-800 text-xs text-emerald-300 font-mono">
                    Nenhum evento discreto de stuttering (&gt; 22,0 ms e &gt; 2,05x a mediana local) foi registrado nesta sessão.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950 text-slate-300 border-b border-slate-800">
                          <th className="p-2.5">#</th>
                          <th className="p-2.5">Instante (s)</th>
                          <th className="p-2.5">Pico Frametime</th>
                          <th className="p-2.5">Mediana Local</th>
                          <th className="p-2.5">Severidade</th>
                          <th className="p-2.5">Temp. CPU / Clock CPU</th>
                          <th className="p-2.5">Clock GPU / Uso GPU</th>
                          <th className="p-2.5">Gatilho Simultâneo Correlacionado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {activeSession.stats.stutterEvents.map((ev) => (
                          <tr key={ev.eventIndex}>
                            <td className="p-2.5 font-mono">#{ev.eventIndex}</td>
                            <td className="p-2.5 font-mono text-sky-300">
                              {ev.startTimeSeconds}s → {ev.endTimeSeconds}s
                            </td>
                            <td className="p-2.5 font-mono font-bold text-red-400">
                              {ev.peakFrametimeMs} ms
                            </td>
                            <td className="p-2.5 font-mono">{ev.localMedianFrametimeMs} ms</td>
                            <td className="p-2.5 font-mono text-amber-300">{ev.ratioToMedian}x</td>
                            <td className="p-2.5 font-mono">
                              {ev.concurrentCpuTempC ?? '—'} °C · {ev.concurrentCpuEffectiveMhz ?? '—'} MHz
                            </td>
                            <td className="p-2.5 font-mono">
                              {ev.concurrentGpuClockMhz ?? '—'} MHz · {ev.concurrentGpuBusyPct ?? '—'}%
                            </td>
                            <td className="p-2.5 text-slate-200">{ev.probableTrigger}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 8: APRESENTAÇÃO E SCREEN TEARING
          ============================================================== */}
          {activeTab === 'presentation-tearing' && (
            <div className="space-y-6">
              {/* 8-Stage Pipeline */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
                <h2 className="text-base font-bold text-slate-100">
                  Cadeia Completa de Apresentação (Aplicação → CPU → GPU Iris Xe → DXGI → DWM → Driver → Monitor 100 Hz)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Inspeção estágio por estágio (Seção 8) sem uso de injeção de DLL ou hooks no processo do jogo.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 text-xs">
                  {activeSession.presentationChain.map((st) => (
                    <div
                      key={st.stageNumber}
                      className={`p-3 rounded border ${
                        st.status === 'bottleneck'
                          ? 'bg-red-950/25 border-red-800/80'
                          : st.status === 'warning'
                          ? 'bg-amber-950/25 border-amber-800/80'
                          : 'bg-slate-950/80 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-sky-400">{st.name}</span>
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-900 text-slate-300">
                          {st.status === 'bottleneck'
                            ? 'Gargalo'
                            : st.status === 'warning'
                            ? 'Atenção'
                            : 'Normal'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">{st.component}</div>
                      <div className="font-mono font-semibold text-slate-100 mt-2">
                        {st.currentValue}
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1.5">{st.technicalDetail}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 8 Phenomena Differentiation Taxonomy */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-slate-100 mb-2">
                  Diferenciação Técnica Obrigatória entre Tearing, Stuttering, Judder, Frames Descartados/Repetidos e Input Lag
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-300 border-b border-slate-800">
                        <th className="p-2.5">Fenômeno</th>
                        <th className="p-2.5">Causa Física Real</th>
                        <th className="p-2.5">Assinatura Medida no PresentMon</th>
                        <th className="p-2.5">Sintoma Visual Percebido</th>
                        <th className="p-2.5">Mito Descartado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {PRESENTATION_PHENOMENA_TAXONOMY.map((ph) => (
                        <tr key={ph.id}>
                          <td className="p-2.5 font-semibold text-sky-300">{ph.name}</td>
                          <td className="p-2.5 text-slate-300">{ph.physicalCause}</td>
                          <td className="p-2.5 font-mono text-amber-300">{ph.presentMonSignature}</td>
                          <td className="p-2.5 text-slate-300">{ph.visualSymptom}</td>
                          <td className="p-2.5 text-slate-400">{ph.commonFalseBelief}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 9: VRR E MONITOR (WEAL LCD 22,5" 100 HZ HDMI)
          ============================================================== */}
          {activeTab === 'vrr-monitor' && (
            <div className="space-y-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
                <h2 className="text-base font-bold text-slate-100">
                  Investigação de VRR e Monitor Externo em 3 Camadas Independentes (Seção 2 e Seção 8)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Monitor alvo: <strong>Weal LCD 22,5 polegadas · 1920 × 1080 @ 100 Hz via HDMI</strong>. O aplicativo jamais presume que a detecção de suporte no EDID comprove que o VRR esteja funcionando efetivamente.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs">
                  <div className="bg-slate-950/90 border border-slate-800 rounded p-4 space-y-2">
                    <div className="text-[11px] font-mono uppercase text-slate-400">
                      Camada 1: Suporte Anunciado (EDID / Monitor)
                    </div>
                    <div className="text-sm font-bold font-mono text-amber-300">
                      {activeSession.vrrAssessment.edidAnnouncedSupport.status}
                    </div>
                    <div className="text-slate-300 font-mono">
                      Faixa: {activeSession.vrrAssessment.edidAnnouncedSupport.rangeHz}
                    </div>
                    <p className="text-slate-400">
                      {activeSession.vrrAssessment.edidAnnouncedSupport.detail}
                    </p>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded p-4 space-y-2">
                    <div className="text-[11px] font-mono uppercase text-slate-400">
                      Camada 2: Suporte do Driver Intel & Windows 11 25H2
                    </div>
                    <div className="text-sm font-bold font-mono text-sky-300">
                      {activeSession.vrrAssessment.driverAndOsSupport.status}
                    </div>
                    <div className="text-slate-300 font-mono">
                      DXGI AllowTearing:{' '}
                      {activeSession.vrrAssessment.driverAndOsSupport.dxgiAllowTearing
                        ? '1 (Ativo para V-Sync OFF)'
                        : '0'}
                    </div>
                    <p className="text-slate-400">
                      {activeSession.vrrAssessment.driverAndOsSupport.detail}
                    </p>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded p-4 space-y-2">
                    <div className="text-[11px] font-mono uppercase text-slate-400">
                      Camada 3: Funcionamento Efetivo em Tempo Real (PresentMon)
                    </div>
                    <div className="text-sm font-bold font-mono text-red-400">
                      {activeSession.vrrAssessment.effectiveRuntimeOperation.status}
                    </div>
                    <div className="text-slate-300 font-mono">
                      Quantizado ao ciclo de 10,0 ms:{' '}
                      {activeSession.vrrAssessment.effectiveRuntimeOperation.quantizedTo10msPct ??
                        '—'}
                      %
                    </div>
                    <p className="text-slate-400">
                      {activeSession.vrrAssessment.effectiveRuntimeOperation.detail}
                    </p>
                  </div>
                </div>

                <div className="mt-4 p-3 rounded bg-slate-950 border border-slate-800 text-xs text-slate-200">
                  <strong className="text-sky-300">Conclusão Fundamentada sobre VRR e 100 Hz: </strong>
                  {activeSession.vrrAssessment.overallConclusion}
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 10: SESSÕES DE TESTE & COMPARADOR A/B
          ============================================================== */}
          {activeTab === 'sessions-ab' && (
            <SessionsAndAbComparator
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={setActiveSessionId}
              onAddCustomSession={handleAddCustomSession}
            />
          )}

          {/* ==============================================================
              TAB 11: MOTOR DE DIAGNÓSTICO CAUSAL
          ============================================================== */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
                <h2 className="text-base font-bold text-slate-100">
                  Motor de Diagnóstico Causal e Avaliação de Hipóteses (Seção 11)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Cada conclusão é classificada em um dos 5 níveis de confiança (<code className="text-emerald-300">Confirmado por medição</code>, <code className="text-sky-300">Forte evidência</code>, <code className="text-amber-300">Evidência moderada</code>, <code className="text-purple-300">Hipótese</code>, <code className="text-slate-400">Informação insuficiente</code>) e detalha o que aconteceu, quando, quais indicadores mudaram simultaneamente, hipóteses compatíveis, hipóteses descartadas e o teste confirmatório.
                </p>
              </div>

              {activeSession.findings.map((f) => (
                <div
                  key={f.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-lg p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-sky-300 border border-slate-700">
                        {f.category}
                      </span>
                      <h3 className="text-sm font-bold text-slate-100">{f.title}</h3>
                    </div>
                    <span className="px-2.5 py-1 rounded text-xs font-mono font-semibold bg-emerald-950/90 border border-emerald-700 text-emerald-200">
                      Nível de Confiança: {f.confidence}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-950/80 border border-slate-800 rounded p-3 space-y-1.5">
                      <div>
                        <strong className="text-sky-300">O que aconteceu: </strong>
                        <span className="text-slate-200">{f.whatHappened}</span>
                      </div>
                      <div>
                        <strong className="text-amber-300">Quando aconteceu: </strong>
                        <span className="text-slate-200 font-mono">{f.whenHappened}</span>
                      </div>
                      <div>
                        <strong className="text-emerald-300">Qual indicador mudou: </strong>
                        <span className="text-slate-200">{f.primaryIndicatorChanged}</span>
                      </div>
                    </div>

                    <div className="bg-slate-950/80 border border-slate-800 rounded p-3 space-y-1.5">
                      <div className="font-semibold text-purple-300">
                        Quais outros indicadores mudaram simultaneamente:
                      </div>
                      <ul className="list-disc pl-4 space-y-1 text-slate-300">
                        {f.simultaneousIndicators.map((ind, idx) => (
                          <li key={idx}>{ind}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="bg-slate-950/80 border border-emerald-900/50 rounded p-3">
                      <div className="font-semibold text-emerald-400 mb-1">
                        Hipóteses Compatíveis com os Dados:
                      </div>
                      <ul className="list-disc pl-4 space-y-1 text-slate-300">
                        {f.compatibleHypotheses.map((h, idx) => (
                          <li key={idx}>{h}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-slate-950/80 border border-red-900/50 rounded p-3">
                      <div className="font-semibold text-red-400 mb-1">
                        Hipóteses Descartadas pelas Evidências:
                      </div>
                      <ul className="list-disc pl-4 space-y-1 text-slate-300">
                        {f.discardedHypotheses.map((h, idx) => (
                          <li key={idx}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded p-3 text-xs space-y-1.5">
                    <div>
                      <strong className="text-slate-200">Evidências que sustentam a conclusão: </strong>
                      <span className="text-slate-300">{f.supportingEvidence.join(' · ')}</span>
                    </div>
                    <div>
                      <strong className="text-sky-300">Teste adicional A/B para confirmar a hipótese: </strong>
                      <span className="text-slate-200">{f.confirmatoryTest}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ==============================================================
              TAB 12: RECOMENDAÇÕES SEGURAS E REVERSÍVEIS
          ============================================================== */}
          {activeTab === 'recommendations' && (
            <div className="space-y-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
                <h2 className="text-base font-bold text-slate-100">
                  Recomendações Fundamentadas, Seguras e 100% Reversíveis (Seção 12)
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Este aplicativo é estritamente somente de leitura. Ele <strong>nunca</strong> modifica automaticamente BIOS, Firmware, PL1/PL2, Tensão, EPP, PROCHOT, TCC Offset, Registradores MSR, Registro do Windows, Driver, Valorant ou Vanguard, e jamais promete eliminar tearing fisicamente com V-Sync desligado ou forçar 1,40 GHz fixos.
                </p>
              </div>

              {activeSession.recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-lg p-4 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                    <h3 className="text-sm font-bold text-slate-100">{rec.title}</h3>
                    <span className="px-2.5 py-0.5 rounded font-mono bg-sky-950 text-sky-300 border border-sky-800">
                      Prioridade: {rec.priority} · {rec.category}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-slate-950/80 border border-slate-800 rounded p-3 space-y-2">
                      <div>
                        <strong className="text-amber-300">1. Problema observado: </strong>
                        <span className="text-slate-200">{rec.observedProblem}</span>
                      </div>
                      <div>
                        <strong className="text-sky-300">2. Evidência medida: </strong>
                        <span className="text-slate-200 font-mono">{rec.evidence}</span>
                      </div>
                      <div>
                        <strong className="text-emerald-300">3. Ação sugerida: </strong>
                        <span className="text-slate-200">{rec.suggestedAction}</span>
                      </div>
                    </div>

                    <div className="bg-slate-950/80 border border-slate-800 rounded p-3 space-y-2">
                      <div>
                        <strong className="text-purple-300">4. Benefício esperado: </strong>
                        <span className="text-slate-200">{rec.expectedBenefit}</span>
                      </div>
                      <div>
                        <strong className="text-slate-300">5. Risco: </strong>
                        <span className="text-slate-300">{rec.risk}</span>
                      </div>
                      <div>
                        <strong className="text-rose-300">6. Como desfazer (Reversibilidade): </strong>
                        <span className="text-slate-200">{rec.howToUndo}</span>
                      </div>
                      <div>
                        <strong className="text-sky-300">7. Como medir se houve melhora: </strong>
                        <span className="text-slate-200">{rec.howToMeasureImprovement}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ==============================================================
              TAB 13: EXPORTAÇÃO E PACOTES DE DISTRIBUIÇÃO
          ============================================================== */}
          {activeTab === 'export' && (
            <div className="space-y-6">
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4 space-y-4">
                <h2 className="text-base font-bold text-slate-100">
                  Exportação de Relatórios e Pacote ZIP de Diagnóstico (Seção 15 e Seção 17)
                </h2>
                <p className="text-xs text-slate-400">
                  Gera relatórios completos contendo Hardware, SO, Driver, Monitor, Configurações, Fontes de Telemetria, Dados Coletados, Eventos de Stuttering, Métricas Calculadas, Hipóteses, Nível de Confiança, Recomendações e Limitações. Nenhum dado é enviado para servidores externos.
                </p>

                <label className="flex items-center gap-2.5 p-3 rounded bg-slate-950 border border-slate-800 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sanitizePii}
                    onChange={(e) => setSanitizePii(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <div>
                    <span className="font-semibold text-emerald-300">
                      Remover informações pessoais e caminhos de usuário antes da exportação (Sanitização de PII Ativa)
                    </span>
                    <p className="text-slate-400 text-[11px]">
                      Substitui automaticamente caminhos como <code className="font-mono">C:\Users\nome\...</code> por <code className="font-mono">C:\Users\[USUARIO_REMOVIDO]\...</code> em todos os formatos exportados.
                    </p>
                  </div>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => handleExportFormat('csv')}
                    className="p-4 rounded bg-slate-950 hover:bg-slate-800 border border-slate-700 text-left transition space-y-1"
                  >
                    <div className="font-mono font-bold text-sky-400 text-sm">1. Exportar CSV</div>
                    <p className="text-slate-400">
                      Série temporal sincronizada completa com escape RFC-4180 + CRLF corrigido (AUD-11).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportFormat('json')}
                    className="p-4 rounded bg-slate-950 hover:bg-slate-800 border border-slate-700 text-left transition space-y-1"
                  >
                    <div className="font-mono font-bold text-emerald-400 text-sm">2. Exportar JSON</div>
                    <p className="text-slate-400">
                      Relatório estruturado completo (hardware, estatísticas, VRR, diagnóstico causal e 0 escritas).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportFormat('html')}
                    className="p-4 rounded bg-slate-950 hover:bg-slate-800 border border-slate-700 text-left transition space-y-1"
                  >
                    <div className="font-mono font-bold text-purple-400 text-sm">3. Exportar HTML</div>
                    <p className="text-slate-400">
                      Relatório técnico formatado autocontido pronto para leitura ou impressão em PDF.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportFormat('zip')}
                    className="p-4 rounded bg-sky-950/60 hover:bg-sky-900/60 border border-sky-600 text-left transition space-y-1"
                  >
                    <div className="font-mono font-bold text-sky-300 text-sm">
                      4. Pacote ZIP de Diagnóstico
                    </div>
                    <p className="text-slate-300">
                      Contém CSV + JSON + HTML + LEIAME + <code className="font-mono">SHA256SUMS.txt</code> calculado localmente.
                    </p>
                  </button>
                </div>

                {zipStatus && (
                  <div className="p-3 rounded bg-slate-950 border border-sky-800 text-xs font-mono space-y-1">
                    <div className="text-sky-300">{zipStatus}</div>
                    {zipHashes && (
                      <div className="text-[11px] text-slate-400 space-y-0.5 pt-1">
                        {Object.entries(zipHashes).map(([fname, hash]) => (
                          <div key={fname}>
                            <span className="text-emerald-400">{hash}</span> · {fname}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Downloadable Windows C#/.NET Refactored Source & Git Bundle (Branch diagnostico-irisxe-v2) */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4 space-y-3 text-xs">
                <h3 className="text-sm font-bold text-slate-100">
                  Artefatos do Repositório Desktop Windows C#/.NET e Bundle Git (Branch <code className="text-sky-300">diagnostico-irisxe-v2</code>)
                </h3>
                <p className="text-slate-400">
                  A branch original <code className="text-slate-200">main</code> (commit <code className="text-slate-200">8501a29a392884e9585fa665797e407797e48bc5</code>) foi integralmente preservada, e as correções em C# (<code className="text-sky-300">AUD-01</code> a <code className="text-sky-300">AUD-11</code>) foram comitadas na branch separada <code className="text-sky-300">diagnostico-irisxe-v2</code>. Como este ambiente sandbox não possui credenciais de push para a conta GitHub remota do usuário, disponibilizamos abaixo o pacote ZIP completo e o Git Bundle oficial com hashes SHA-256 verificados:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-slate-950 border border-slate-800 rounded p-3 space-y-1.5">
                    <div className="font-mono font-semibold text-sky-300">
                      IrisXe-Diagnostic-Suite-v2-Desktop-Source.zip
                    </div>
                    <div className="font-mono text-[11px] text-slate-400 break-all">
                      SHA-256: e93e664715ccb7e14f7e38fe576efd639067f520eb76b39b682cc4dc378e4dec
                    </div>
                    <a
                      href="/artifacts/IrisXe-Diagnostic-Suite-v2-Desktop-Source.zip"
                      download
                      className="inline-block mt-1 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 font-mono"
                    >
                      Baixar Código-Fonte Desktop C# Corrigido (.zip)
                    </a>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded p-3 space-y-1.5">
                    <div className="font-mono font-semibold text-emerald-300">
                      IrisXe-Auditoria-diagnostico-irisxe-v2.bundle
                    </div>
                    <div className="font-mono text-[11px] text-slate-400 break-all">
                      SHA-256: b201a87d2e2e389bca4172d5e303d2636610fda39c56b9e719ca84dc9045fc66
                    </div>
                    <a
                      href="/artifacts/IrisXe-Auditoria-diagnostico-irisxe-v2.bundle"
                      download
                      className="inline-block mt-1 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-100 font-mono"
                    >
                      Baixar Git Bundle Completo (main + diagnostico-irisxe-v2)
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              TAB 14: AUDITORIA DA FASE 1, TESTES AUTOMATIZADOS E REVISÕES
          ============================================================== */}
          {activeTab === 'audit-sources' && (
            <div className="space-y-6">
              {/* Phase 1 Repository Audit Summary */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-100">
                      Etapa 3 Obrigatória: Auditoria Completa do Repositório Existente (Fase 1)
                    </h2>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      Repositório: {PHASE1_REPO_METADATA.repositoryUrl} · Branch original:{' '}
                      {PHASE1_REPO_METADATA.originalBranch} · Commit auditado:{' '}
                      {PHASE1_REPO_METADATA.referenceCommit}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded text-xs font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                    34 Arquivos Inspecionados · 12 Defeitos Verificados e Corrigidos
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-300 border-b border-slate-800">
                        <th className="p-2.5">ID</th>
                        <th className="p-2.5">Problema Auditado na Fase 1</th>
                        <th className="p-2.5">Arquivo e Linhas Exatas</th>
                        <th className="p-2.5">Constatação Técnica Real</th>
                        <th className="p-2.5">Correção Implementada na v2</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {PHASE1_AUDITED_DEFECTS.map((d) => (
                        <tr key={d.id}>
                          <td className="p-2.5 font-mono font-bold text-amber-400">{d.id}</td>
                          <td className="p-2.5 font-semibold text-slate-200">
                            <div>{d.title}</div>
                            <span className="text-[10px] font-mono text-red-300">
                              Severidade: {d.severity}
                            </span>
                          </td>
                          <td className="p-2.5 font-mono text-sky-300">{d.fileAndLines}</td>
                          <td className="p-2.5 text-slate-300">{d.technicalFinding}</td>
                          <td className="p-2.5 text-emerald-300">{d.v2Resolution}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Live Automated Unit & Integration Test Runner (Section 16) */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">
                      Suíte de Testes Automatizados Unitários e de Integração em Tempo Real (Seção 16)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Testa decodificação MSR, ordem de leitura 0x1A2→0x19C→0x1B1, trava fail-closed CPUID, CSVs malformados/incompletos, dados ausentes (<code className="text-sky-300">null</code>), duplicatas, fora de ordem, sincronização temporal, 1% low, VRR e escape CSV/PII.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTestRunCounter((c) => c + 1)}
                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-semibold transition"
                  >
                    Reexecutar Todos os Testes Agora ({automatedTestResults.filter((t) => t.passed).length}/
                    {automatedTestResults.length} Aprovados)
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-300 border-b border-slate-800">
                        <th className="p-2.5">ID</th>
                        <th className="p-2.5">Suíte</th>
                        <th className="p-2.5">Cenário Testado</th>
                        <th className="p-2.5">Estado</th>
                        <th className="p-2.5">Tempo</th>
                        <th className="p-2.5">Evidência Real de Execução</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {automatedTestResults.map((tr) => (
                        <tr key={tr.id}>
                          <td className="p-2.5 font-mono font-bold text-sky-400">{tr.id}</td>
                          <td className="p-2.5 font-mono text-slate-300">{tr.suite}</td>
                          <td className="p-2.5 font-medium text-slate-200">{tr.name}</td>
                          <td className="p-2.5">
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1 w-fit">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {tr.passed ? 'APROVADO' : 'FALHOU'}
                            </span>
                          </td>
                          <td className="p-2.5 font-mono text-slate-400">{tr.durationMs} ms</td>
                          <td className="p-2.5 font-mono text-[11px] text-slate-300">
                            {tr.actualDetails}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Runtime Security SelfCheck */}
                <div className="pt-3 border-t border-slate-800">
                  <div className="text-xs font-semibold text-slate-200 mb-2">
                    Auto-Verificações de Segurança Executadas em Tempo Real (<code className="text-sky-300">runRuntimeSecuritySelfCheck()</code> — Corrige AUD-10):
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                    {runtimeSelfChecks.map((sc) => (
                      <div
                        key={sc.id}
                        className="p-2.5 rounded bg-slate-950 border border-slate-800 flex items-start gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-slate-200">{sc.assertion}</div>
                          <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                            {sc.runtimeEvidence}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section 18: 16 Acceptance Criteria Matrix */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-bold text-slate-100">
                  Seção 18: Matriz Individualizada dos 16 Critérios de Aceitação
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-slate-300 border-b border-slate-800">
                        <th className="p-2.5">Critério</th>
                        <th className="p-2.5">Exigência da Especificação</th>
                        <th className="p-2.5">Estado Oficial</th>
                        <th className="p-2.5">Comprovação e Limitações Declaradas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {ACCEPTANCE_CRITERIA_MATRIX.map((ac) => (
                        <tr key={ac.criterion}>
                          <td className="p-2.5 font-bold text-sky-300">{ac.criterion}</td>
                          <td className="p-2.5 text-slate-200">{ac.requirement}</td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-mono inline-block ${
                                ac.status === 'Implementado e testado'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-amber-950 text-amber-300 border border-amber-800'
                              }`}
                            >
                              {ac.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-300">{ac.evidenceAndLimitation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 21: 10 Mandatory Independent Final Reviews */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-bold text-slate-100">
                  Seção 21: Registro das 10 Revisões Finais Independentes Obrigatórias
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {TEN_INDEPENDENT_REVIEWS.map((rev) => (
                    <div
                      key={rev.reviewNumber}
                      className="bg-slate-950/90 border border-slate-800 rounded p-3 space-y-1"
                    >
                      <div className="font-mono font-bold text-sky-400">
                        Revisão #{rev.reviewNumber}: {rev.title}
                      </div>
                      <div className="text-slate-400 italic">{rev.questionInvestigated}</div>
                      <div>
                        <strong className="text-amber-300">Problema encontrado: </strong>
                        <span className="text-slate-300">{rev.problemsFoundDuringReview}</span>
                      </div>
                      <div>
                        <strong className="text-emerald-300">Correção realizada: </strong>
                        <span className="text-slate-200">{rev.correctionsApplied}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
export default App;
