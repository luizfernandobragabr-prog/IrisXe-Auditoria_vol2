import React, { useState } from 'react';
import {
  buildDiagnosticSessionFromCsvs,
  getSampleCsvTemplates,
} from '../core/sampleSessions';
import { DiagnosticSession } from '../core/types';

interface Props {
  sessions: DiagnosticSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onAddCustomSession: (session: DiagnosticSession) => void;
}

export const SessionsAndAbComparator: React.FC<Props> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onAddCustomSession,
}) => {
  const [compareIdA, setCompareIdA] = useState<string>(sessions[0]?.id ?? '');
  const [compareIdB, setCompareIdB] = useState<string>(sessions[1]?.id ?? sessions[0]?.id ?? '');

  // Custom CSV import state
  const [customName, setCustomName] = useState('Minha Captura Real — Valorant (The Range)');
  const [customStage, setCustomStage] =
    useState<DiagnosticSession['stageType']>('Sessão de Jogo (Valorant)');
  const [customWindowMode, setCustomWindowMode] =
    useState<DiagnosticSession['windowMode']>('Tela Cheia Exclusiva (Fullscreen)');
  const [customVsync, setCustomVsync] = useState(false);
  const [customFpsCap, setCustomFpsCap] = useState<string>('');
  const [customDriver, setCustomDriver] = useState('Intel GFX 31.0.101.5333');
  const [presentMonCsvText, setPresentMonCsvText] = useState('');
  const [hwinfoCsvText, setHwinfoCsvText] = useState('');
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  const sessionA = sessions.find((s) => s.id === compareIdA) ?? sessions[0];
  const sessionB = sessions.find((s) => s.id === compareIdB) ?? sessions[1] ?? sessions[0];

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'presentmon' | 'hwinfo'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      if (target === 'presentmon') {
        setPresentMonCsvText(content);
      } else {
        setHwinfoCsvText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleCreateCustomSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!presentMonCsvText.trim() && !hwinfoCsvText.trim()) {
      setImportFeedback(
        'Erro: Carregue ou cole pelo menos um arquivo CSV válido (PresentMon e/ou HWiNFO64) antes de processar.'
      );
      return;
    }

    const newId = `custom-session-${Date.now()}`;
    const built = buildDiagnosticSessionFromCsvs({
      id: newId,
      name: customName.trim() || `Sessão Importada (${new Date().toLocaleTimeString()})`,
      stageType: customStage,
      presentMonCsv: presentMonCsvText,
      hwinfoCsv: hwinfoCsvText,
      isSimulated: false, // Real user-imported capture!
      driverVersion: customDriver,
      windowMode: customWindowMode,
      vsyncConfigured: customVsync,
      fpsLimitConfigured: customFpsCap.trim() ? Number(customFpsCap) : null,
      vrrConfigured: false,
      monitorRefreshHz: 100,
    });

    if (built.presentMonFrames.length === 0 && built.hwinfoSamples.length === 0) {
      setImportFeedback(
        `Falha na validação: Nenhuma linha válida encontrada. Avisos do parser: ${built.parseNotes.join(' | ')}`
      );
      return;
    }

    onAddCustomSession(built);
    setCompareIdB(newId);
    setImportFeedback(
      `Sessão criada e selecionada com sucesso! (${built.presentMonFrames.length} quadros PresentMon + ${built.hwinfoSamples.length} amostras HWiNFO64 sincronizadas em ${built.synchronizedStream.length} janelas).`
    );
  };

  const handleDownloadSampleCsv = (kind: 'presentmon' | 'hwinfo') => {
    const templates = getSampleCsvTemplates();
    const content = kind === 'presentmon' ? templates.presentMonCsv : templates.hwinfoCsv;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      kind === 'presentmon'
        ? 'modelo-presentmon-valorant.csv'
        : 'modelo-hwinfo64-sensores.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const avgDisplayLatency = (s: DiagnosticSession): number | null => {
    const valid = s.presentMonFrames
      .map((f) => f.msUntilDisplayed)
      .filter((v): v is number => v !== null && v > 0);
    if (valid.length === 0) return null;
    return Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2));
  };

  const maxCpuTemp = (s: DiagnosticSession): number | null => {
    const valid = s.hwinfoSamples
      .map((h) => h.cpuTempC)
      .filter((v): v is number => v !== null);
    if (valid.length === 0) return null;
    return Math.max(...valid);
  };

  // Check how many configuration variables changed between Session A and Session B
  const changedVars: string[] = [];
  if (sessionA && sessionB) {
    if (sessionA.vsyncConfigured !== sessionB.vsyncConfigured) changedVars.push('V-Sync');
    if (sessionA.windowMode !== sessionB.windowMode) changedVars.push('Modo de Tela/Janela');
    if (sessionA.fpsLimitConfigured !== sessionB.fpsLimitConfigured) changedVars.push('Limite de FPS');
    if (sessionA.powerPlan !== sessionB.powerPlan) changedVars.push('Configuração de Energia');
    if (sessionA.vrrConfigured !== sessionB.vrrConfigured) changedVars.push('VRR');
  }

  return (
    <div className="space-y-6">
      {/* Reproducible 4-Step Protocol Guide */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-100">
          Roteiro Oficial de Teste Reproduzível (Sem Injeção ou Controle Automático do Jogo)
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Este aplicativo nunca injeta DLLs, não faz hooks na memória do Valorant e não interage com o Riot Vanguard. O usuário executa manualmente as etapas abaixo e importa os logs CSV oficiais do PresentMon e HWiNFO64:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3 text-xs">
          <div className="bg-slate-950/80 border border-slate-800 rounded p-3">
            <div className="font-mono font-bold text-sky-400">Etapa 1: Repouso (60s)</div>
            <p className="text-slate-300 mt-1">
              Com o jogo fechado, iniciar log HWiNFO64 CSV (intervalo 500 ms) para registrar temperatura base (~45–50 °C), potência de repouso (~3–4 W) e identificar processos em segundo plano.
            </p>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 rounded p-3">
            <div className="font-mono font-bold text-amber-400">Etapa 2: Aquecimento Controlado</div>
            <p className="text-slate-300 mt-1">
              Abrir o Valorant no mapa <strong>The Range (Estande de Tiro)</strong> por 3 minutos para estabilizar a capacidade térmica do dissipador (transição PL2 28W → PL1 15W).
            </p>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 rounded p-3">
            <div className="font-mono font-bold text-emerald-400">Etapa 3: Sessão de Jogo (120s)</div>
            <p className="text-slate-300 mt-1">
              Iniciar coleta do <strong>PresentMon oficial</strong> (<code className="text-sky-300">PresentMon.exe -process_name VALORANT-Win64-Shipping.exe -output_file pm.csv</code>) simultaneamente ao HWiNFO64 CSV durante teste de tiro/movimento.
            </p>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 rounded p-3">
            <div className="font-mono font-bold text-purple-400">Etapa 4: Repetição e Comparação A/B</div>
            <p className="text-slate-300 mt-1">
              Alterar <strong>apenas uma variável por vez</strong> no menu do jogo (ex.: Limite de FPS ou Modo de Janela), repetir os 120s no The Range e comparar lado a lado abaixo.
            </p>
          </div>
        </div>
      </div>

      {/* Side-by-Side A/B Session Comparator */}
      {sessionA && sessionB && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Comparador Reproduzível A/B de Sessões de Diagnóstico
              </h3>
              <p className="text-xs text-slate-400">
                Compare métricas de frametime, 1% low, latência de apresentação, temperatura e clock da GPU Iris Xe entre duas sessões.
              </p>
            </div>
            <div className="text-xs font-mono">
              {changedVars.length === 1 ? (
                <span className="px-2.5 py-1 rounded bg-emerald-950/90 border border-emerald-700 text-emerald-200">
                  Isolamento A/B Ideal: Apenas 1 variável alterada ({changedVars[0]})
                </span>
              ) : changedVars.length > 1 ? (
                <span className="px-2.5 py-1 rounded bg-amber-950/90 border border-amber-700 text-amber-200">
                  Aviso Metodológico: {changedVars.length} variáveis mudaram simultaneamente ({changedVars.join(', ')})
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300">
                  Mesma configuração declarada (Teste de Repetibilidade)
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">Sessão Base (A):</label>
              <select
                value={compareIdA}
                onChange={(e) => setCompareIdA(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 font-mono text-xs"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isSimulated ? '[SIMULADO]' : '[REAL]'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">Sessão Comparada (B):</label>
              <select
                value={compareIdB}
                onChange={(e) => setCompareIdB(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 font-mono text-xs"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.isSimulated ? '[SIMULADO]' : '[REAL]'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-300 border-b border-slate-800">
                  <th className="p-2.5">Indicador / Parâmetro</th>
                  <th className="p-2.5 font-mono text-sky-300">Sessão A (Base)</th>
                  <th className="p-2.5 font-mono text-emerald-300">Sessão B (Comparada)</th>
                  <th className="p-2.5 font-mono">Diferença (B − A)</th>
                  <th className="p-2.5">Interpretação Técnica</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                <tr>
                  <td className="p-2.5 font-medium text-slate-200">Modo de Janela & V-Sync</td>
                  <td className="p-2.5 font-mono">{sessionA.windowMode} · V-Sync={sessionA.vsyncConfigured ? 'ON' : 'OFF'}</td>
                  <td className="p-2.5 font-mono">{sessionB.windowMode} · V-Sync={sessionB.vsyncConfigured ? 'ON' : 'OFF'}</td>
                  <td className="p-2.5 font-mono text-slate-400">Configuração</td>
                  <td className="p-2.5 text-slate-400">Controla se há bypass do DWM (Independent Flip) ou espera por V-Blank.</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-medium text-slate-200">Limite de FPS Configurado</td>
                  <td className="p-2.5 font-mono">{sessionA.fpsLimitConfigured ?? 'Ilimitado'}</td>
                  <td className="p-2.5 font-mono">{sessionB.fpsLimitConfigured ?? 'Ilimitado'}</td>
                  <td className="p-2.5 font-mono text-slate-400">Configuração</td>
                  <td className="p-2.5 text-slate-400">Limites não-harmônicos (ex.: 117 FPS em 100 Hz) reduzem calor e dispersam fase do tearing.</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-medium text-slate-200">FPS Médio</td>
                  <td className="p-2.5 font-mono">{sessionA.stats.avgFps ?? '—'} FPS</td>
                  <td className="p-2.5 font-mono">{sessionB.stats.avgFps ?? '—'} FPS</td>
                  <td className="p-2.5 font-mono">
                    {sessionA.stats.avgFps !== null && sessionB.stats.avgFps !== null
                      ? `${(sessionB.stats.avgFps - sessionA.stats.avgFps).toFixed(1)} FPS`
                      : '—'}
                  </td>
                  <td className="p-2.5 text-slate-400">Taxa média bruta; nunca deve ser avaliada sem o 1% Low.</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-medium text-slate-200">1% Low FPS (Consistência P99)</td>
                  <td className="p-2.5 font-mono font-bold">{sessionA.stats.fps1PercentLow ?? '—'} FPS</td>
                  <td className="p-2.5 font-mono font-bold">{sessionB.stats.fps1PercentLow ?? '—'} FPS</td>
                  <td className="p-2.5 font-mono font-bold text-sky-300">
                    {sessionA.stats.fps1PercentLow !== null && sessionB.stats.fps1PercentLow !== null
                      ? `${sessionB.stats.fps1PercentLow - sessionA.stats.fps1PercentLow >= 0 ? '+' : ''}${(
                          sessionB.stats.fps1PercentLow - sessionA.stats.fps1PercentLow
                        ).toFixed(1)} FPS`
                      : '—'}
                  </td>
                  <td className="p-2.5 text-slate-300">
                    Indicador mais importante de fluidez durante combates (1000 / Frametime P99).
                  </td>
                </tr>
                <tr>
                  <td className="p-2.5 font-medium text-slate-200">Frametime P99 / Desvio Padrão</td>
                  <td className="p-2.5 font-mono">
                    {sessionA.stats.p99FrametimeMs ?? '—'} ms (σ={sessionA.stats.stdDevFrametimeMs ?? '—'} ms)
                  </td>
                  <td className="p-2.5 font-mono">
                    {sessionB.stats.p99FrametimeMs ?? '—'} ms (σ={sessionB.stats.stdDevFrametimeMs ?? '—'} ms)
                  </td>
                  <td className="p-2.5 font-mono">
                    {sessionA.stats.p99FrametimeMs !== null && sessionB.stats.p99FrametimeMs !== null
                      ? `${(sessionB.stats.p99FrametimeMs - sessionA.stats.p99FrametimeMs).toFixed(2)} ms`
                      : '—'}
                  </td>
                  <td className="p-2.5 text-slate-400">Menor P99 e menor σ significam frame pacing mais previsível na mira.</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-medium text-slate-200">Eventos de Stuttering (Contagem / Duração)</td>
                  <td className="p-2.5 font-mono">
                    {sessionA.stats.stutterEventsCount} ({sessionA.stats.totalStutterDurationMs} ms)
                  </td>
                  <td className="p-2.5 font-mono">
                    {sessionB.stats.stutterEventsCount} ({sessionB.stats.totalStutterDurationMs} ms)
                  </td>
                  <td className="p-2.5 font-mono">
                    {sessionB.stats.stutterEventsCount - sessionA.stats.stutterEventsCount} eventos
                  </td>
                  <td className="p-2.5 text-slate-400">Picos discretos &gt; 22 ms e &gt; 2,05x a mediana móvel local.</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-medium text-slate-200">Latência de Apresentação (MsUntilDisplayed)</td>
                  <td className="p-2.5 font-mono">{avgDisplayLatency(sessionA) ?? '—'} ms</td>
                  <td className="p-2.5 font-mono">{avgDisplayLatency(sessionB) ?? '—'} ms</td>
                  <td className="p-2.5 font-mono">
                    {avgDisplayLatency(sessionA) !== null && avgDisplayLatency(sessionB) !== null
                      ? `${(avgDisplayLatency(sessionB)! - avgDisplayLatency(sessionA)!).toFixed(2)} ms`
                      : '—'}
                  </td>
                  <td className="p-2.5 text-slate-400">Mede o custo real de input lag adicionado pelo DWM ou V-Sync.</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-medium text-slate-200">Temperatura Máx. CPU / Clock Mín. GPU</td>
                  <td className="p-2.5 font-mono">
                    {maxCpuTemp(sessionA) ?? '—'} °C · GPU mín {sessionA.stats.gpuClockMinMhz ?? '—'} MHz
                  </td>
                  <td className="p-2.5 font-mono">
                    {maxCpuTemp(sessionB) ?? '—'} °C · GPU mín {sessionB.stats.gpuClockMinMhz ?? '—'} MHz
                  </td>
                  <td className="p-2.5 font-mono">
                    {maxCpuTemp(sessionA) !== null && maxCpuTemp(sessionB) !== null
                      ? `${maxCpuTemp(sessionB)! - maxCpuTemp(sessionA)!} °C`
                      : '—'}
                  </td>
                  <td className="p-2.5 text-slate-400">Demonstra se o controle térmico preservou o clock da GPU Iris Xe.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Real CSV Importer Form */}
      <form
        onSubmit={handleCreateCustomSession}
        className="bg-slate-900/90 border border-slate-800 rounded-lg p-4 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Importar Arquivos CSV Reais (PresentMon Oficial + HWiNFO64)
            </h3>
            <p className="text-xs text-slate-400">
              Processa seus próprios arquivos CSV localmente no navegador (nenhum dado é enviado para servidores externos).
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleDownloadSampleCsv('presentmon')}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 font-mono"
            >
              Baixar CSV Modelo PresentMon
            </button>
            <button
              type="button"
              onClick={() => handleDownloadSampleCsv('hwinfo')}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 font-mono"
            >
              Baixar CSV Modelo HWiNFO64
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          <div className="lg:col-span-2">
            <label className="block text-slate-400 mb-1">Nome da Sessão:</label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Etapa do Roteiro:</label>
            <select
              value={customStage}
              onChange={(e) => setCustomStage(e.target.value as DiagnosticSession['stageType'])}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
            >
              <option value="Repouso">Repouso</option>
              <option value="Aquecimento Controlado">Aquecimento Controlado</option>
              <option value="Sessão de Jogo (Valorant)">Sessão de Jogo (Valorant)</option>
              <option value="Repetição / Comparação A/B">Repetição / Comparação A/B</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Modo de Janela:</label>
            <select
              value={customWindowMode}
              onChange={(e) =>
                setCustomWindowMode(e.target.value as DiagnosticSession['windowMode'])
              }
              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100"
            >
              <option value="Tela Cheia Exclusiva (Fullscreen)">Tela Cheia Exclusiva</option>
              <option value="Sem Bordas (Borderless Windowed)">Sem Bordas (Borderless)</option>
              <option value="Janela">Janela</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-slate-400 mb-1">Limite FPS:</label>
              <input
                type="number"
                placeholder="Ilimitado"
                value={customFpsCap}
                onChange={(e) => setCustomFpsCap(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-mono"
              />
            </div>
            <label className="flex items-center gap-1.5 pb-2 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={customVsync}
                onChange={(e) => setCustomVsync(e.target.checked)}
              />
              <span>V-Sync</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="bg-slate-950/80 border border-slate-800 rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sky-400">1. Arquivo CSV do PresentMon (v1 ou v2)</span>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={(e) => handleFileUpload(e, 'presentmon')}
                className="text-[11px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-800 file:text-slate-200"
              />
            </div>
            <textarea
              rows={4}
              value={presentMonCsvText}
              onChange={(e) => setPresentMonCsvText(e.target.value)}
              placeholder="Ou cole aqui o conteúdo CSV do PresentMon (Application,PresentMode,SyncInterval,AllowsTearing,TimeInSeconds,MsBetweenPresents...)"
              className="w-full bg-slate-900 border border-slate-800 rounded p-2 font-mono text-[11px] text-slate-200"
            />
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-400">2. Arquivo CSV de Sensores do HWiNFO64</span>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={(e) => handleFileUpload(e, 'hwinfo')}
                className="text-[11px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-slate-800 file:text-slate-200"
              />
            </div>
            <textarea
              rows={4}
              value={hwinfoCsvText}
              onChange={(e) => setHwinfoCsvText(e.target.value)}
              placeholder="Ou cole aqui o conteúdo CSV do HWiNFO64 (TimeInSeconds,Total CPU Usage [%],Core Effective Clocks (avg) [MHz],CPU Package [°C],GPU Clock [MHz]...)"
              className="w-full bg-slate-900 border border-slate-800 rounded p-2 font-mono text-[11px] text-slate-200"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            Driver registrado na sessão:{' '}
            <input
              type="text"
              value={customDriver}
              onChange={(e) => setCustomDriver(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 font-mono text-slate-200 ml-1"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition"
          >
            Sincronizar Fontes, Calcular Percentis e Executar Motor de Diagnóstico
          </button>
        </div>

        {importFeedback && (
          <div className="p-2.5 rounded bg-slate-950 border border-sky-800 text-xs text-sky-300 font-mono">
            {importFeedback}
          </div>
        )}
      </form>

      {/* Registered Sessions List */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-100 mb-3">
          Sessões Registradas na Suíte ({sessions.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sessions.map((s) => {
            const isCurrent = s.id === activeSessionId;
            return (
              <div
                key={s.id}
                onClick={() => onSelectSession(s.id)}
                className={`p-3 rounded border cursor-pointer transition ${
                  isCurrent
                    ? 'bg-slate-800/90 border-sky-500'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-100">{s.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                      s.isSimulated
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    }`}
                  >
                    {s.isSimulated ? 'REFERÊNCIA (SIMULADO)' : 'IMPORTADO (REAL)'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono mt-1.5">
                  FPS méd: {s.stats.avgFps ?? '—'} · 1% Low: {s.stats.fps1PercentLow ?? '—'} FPS ·
                  P99: {s.stats.p99FrametimeMs ?? '—'} ms · Stutters: {s.stats.stutterEventsCount}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
