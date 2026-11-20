import JSZip from 'jszip';
import { HardwareComponentComparison } from './hardwareProfile';
import { DiagnosticSession } from './types';

/**
 * Strips Windows user paths (C:\Users\name\...), POSIX home paths (/Users/name/..., /home/name/...),
 * and machine hostnames when sanitizePii is enabled.
 */
export function sanitizePersonalPaths(input: string, sanitizePii: boolean): string {
  if (!sanitizePii || !input) return input;
  return input
    .replace(/[A-Za-z]:\\Users\\[^\\/:*?"<>|\r\n]+/gi, 'C:\\Users\\[USUARIO_REMOVIDO]')
    .replace(/\/Users\/[^/\r\n]+/g, '/Users/[USUARIO_REMOVIDO]')
    .replace(/\/home\/[^/\r\n]+/g, '/home/[USUARIO_REMOVIDO]');
}

/**
 * Complete RFC-4180 + semicolon/CR/LF + CSV-Injection safe escaping (Fixes Phase 1 defect AUD-11).
 */
export function escapeCsvField(raw: string | number | boolean | null | undefined, delimiter: ';' | ',' = ';'): string {
  if (raw === null || raw === undefined) return '';
  let str = String(raw);
  // Prevent spreadsheet formula injection when starting with =, +, @, or tab/CR
  if (/^[=+@\t]/.test(str)) {
    str = `'${str}`;
  }
  const mustQuote =
    str.includes(delimiter) ||
    str.includes(',') ||
    str.includes(';') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r');

  if (mustQuote) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateSynchronizedCsv(
  session: DiagnosticSession,
  options: { sanitizePii?: boolean; delimiter?: ';' | ',' } = {}
): string {
  const delimiter = options.delimiter ?? ';';
  const sanitize = options.sanitizePii ?? true;

  const headers = [
    'window_index',
    'time_seconds',
    'timestamp_utc',
    'is_simulated',
    'source_presentmon',
    'source_hwinfo',
    'temporal_delta_ms',
    'fps_instant',
    'displayed_fps_instant',
    'frametime_ms',
    'frametime_p99_window_ms',
    'ms_between_display_change',
    'ms_until_displayed',
    'cpu_busy_ms',
    'cpu_wait_ms',
    'gpu_busy_ms',
    'gpu_wait_ms',
    'present_mode',
    'sync_interval',
    'allows_tearing',
    'dropped_frames_count',
    'repeated_frames_count',
    'tearing_risk_active',
    'stutter_event_active',
    'gpu_clock_mhz',
    'gpu_usage_pct',
    'gpu_power_w',
    'gpu_temp_c',
    'cpu_usage_total_pct',
    'cpu_max_thread_usage_pct',
    'cpu_effective_clock_mhz',
    'cpu_temp_c',
    'cpu_package_power_w',
    'cpu_thermal_throttling',
    'cpu_power_limit_throttling',
    'cpu_prochot_active',
    'ram_used_mb',
  ];

  const lines: string[] = [headers.join(delimiter)];

  for (const pt of session.synchronizedStream) {
    const row = [
      pt.windowIndex,
      pt.timeSeconds,
      pt.timestampUtc,
      pt.isSimulated ? 'sim' : 'nao',
      sanitizePersonalPaths(pt.sourcePresentMon, sanitize),
      sanitizePersonalPaths(pt.sourceHwinfo, sanitize),
      pt.temporalDeltaMs,
      pt.fpsInstant,
      pt.displayedFpsInstant,
      pt.frametimeMs,
      pt.frametimeP99WindowMs,
      pt.msBetweenDisplayChange,
      pt.msUntilDisplayed,
      pt.cpuBusyMs,
      pt.cpuWaitMs,
      pt.gpuBusyMs,
      pt.gpuWaitMs,
      pt.presentMode,
      pt.syncInterval,
      pt.allowsTearing === null ? '' : pt.allowsTearing ? '1' : '0',
      pt.droppedFramesCount,
      pt.repeatedFramesCount,
      pt.tearingRiskActive ? 'sim' : 'nao',
      pt.stutterEventActive ? 'sim' : 'nao',
      pt.gpuClockMhz,
      pt.gpuUsagePct,
      pt.gpuPowerW,
      pt.gpuTempC,
      pt.cpuUsageTotalPct,
      pt.cpuMaxThreadUsagePct,
      pt.cpuEffectiveClockMhz,
      pt.cpuTempC,
      pt.cpuPackagePowerW,
      pt.cpuThermalThrottling === null ? '' : pt.cpuThermalThrottling ? 'sim' : 'nao',
      pt.cpuPowerLimitThrottling === null ? '' : pt.cpuPowerLimitThrottling ? 'sim' : 'nao',
      pt.cpuProchotActive === null ? '' : pt.cpuProchotActive ? 'sim' : 'nao',
      pt.ramUsedMb,
    ];
    lines.push(row.map((cell) => escapeCsvField(cell, delimiter)).join(delimiter));
  }

  return lines.join('\r\n') + '\r\n';
}

export function generateDiagnosticJson(
  session: DiagnosticSession,
  hardwareTable: HardwareComponentComparison[],
  options: { sanitizePii?: boolean } = {}
): string {
  const sanitize = options.sanitizePii ?? true;

  const payload = {
    projeto: 'IRIS XE DIAGNOSTIC SUITE v2.0',
    geradoEmUtc: new Date().toISOString(),
    privacidadeSanitizada: sanitize,
    envioExternoRealizado: false,
    operacoesDeEscritaNoSistema: 0,
    sessao: {
      id: session.id,
      nome: sanitizePersonalPaths(session.name, sanitize),
      etapaRoteiro: session.stageType,
      criadaEmUtc: session.createdAtUtc,
      modoSimulado: session.isSimulated,
      avisoSimulacao: session.isSimulated
        ? session.simulationNotice ?? 'Dados de referência rotulados como SIMULADOS.'
        : null,
      driverGrafico: session.driverVersion,
      sistemaOperacional: session.osVersion,
      resolucao: session.resolution,
      frequenciaMonitorHz: session.monitorRefreshHz,
      planoEnergia: session.powerPlan,
      modoJanela: session.windowMode,
      vsyncConfigurado: session.vsyncConfigured,
      limiteFpsConfigurado: session.fpsLimitConfigured,
      vrrConfigurado: session.vrrConfigured,
      fontesTelemetria: session.telemetrySources.map((s) => sanitizePersonalPaths(s, sanitize)),
    },
    comparacaoHardwareAlvo: hardwareTable.map((h) => ({
      componente: h.componentName,
      especificacaoAlvo: h.expectedTargetSpec,
      detectadoAmbienteAtual: sanitizePersonalPaths(h.detectedLiveEnvironment, sanitize),
      detectadoLogSessao: sanitizePersonalPaths(h.detectedInActiveSessionLog, sanitize),
      fonte: h.sourceOfDetection,
      estado: h.status,
      notaTecnica: h.technicalNote,
    })),
    metricasCalculadas: session.stats,
    avaliacaoVrrTresCamadas: session.vrrAssessment,
    cadeiaApresentacao: session.presentationChain,
    correlacoesTemporais: session.correlations,
    diagnosticoCausal: session.findings,
    recomendacoesSeguras: session.recommendations,
    limitacoesDaColeta: [
      'Dados ausentes nunca são convertidos em zero (permanecem null).',
      'Correlação estatística temporal não implica causalidade isolada sem confirmação por teste A/B controlado.',
      'Leitura direta de MSR no Windows 11 exige driver kernel assinado; portanto, a suíte prioriza PresentMon ETW oficial e importação CSV HWiNFO64 sem instalar drivers vulneráveis (WinRing0/WinIo proibidos).',
      ...session.parseNotes,
    ],
    amostrasSincronizadas: session.synchronizedStream,
  };

  return JSON.stringify(payload, null, 2);
}

export function generateDiagnosticHtmlReport(
  session: DiagnosticSession,
  hardwareTable: HardwareComponentComparison[],
  options: { sanitizePii?: boolean } = {}
): string {
  const sanitize = options.sanitizePii ?? true;
  const esc = (s: string | number | null | undefined) =>
    String(s ?? '—')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const findingsHtml = session.findings
    .map(
      (f) => `
      <div class="card">
        <div class="card-header">
          <strong>${esc(f.title)}</strong>
          <span class="badge">${esc(f.category)} · Confiança: ${esc(f.confidence)}</span>
        </div>
        <p><strong>O que aconteceu:</strong> ${esc(f.whatHappened)}</p>
        <p><strong>Quando aconteceu:</strong> ${esc(f.whenHappened)}</p>
        <p><strong>Indicador principal alterado:</strong> ${esc(f.primaryIndicatorChanged)}</p>
        <p><strong>Indicadores simultâneos:</strong> ${esc(f.simultaneousIndicators.join(' | '))}</p>
        <p><strong>Hipóteses compatíveis:</strong> ${esc(f.compatibleHypotheses.join(' ; '))}</p>
        <p><strong>Hipóteses descartadas:</strong> ${esc(f.discardedHypotheses.join(' ; '))}</p>
        <p><strong>Evidência:</strong> ${esc(f.supportingEvidence.join(' | '))}</p>
        <p><strong>Teste confirmatório A/B sugerido:</strong> ${esc(f.confirmatoryTest)}</p>
      </div>`
    )
    .join('\n');

  const recsHtml = session.recommendations
    .map(
      (r) => `
      <div class="card">
        <div class="card-header">
          <strong>${esc(r.title)}</strong>
          <span class="badge">Prioridade: ${esc(r.priority)}</span>
        </div>
        <p><strong>Problema observado:</strong> ${esc(r.observedProblem)}</p>
        <p><strong>Evidência:</strong> ${esc(r.evidence)}</p>
        <p><strong>Ação sugerida:</strong> ${esc(r.suggestedAction)}</p>
        <p><strong>Benefício esperado:</strong> ${esc(r.expectedBenefit)}</p>
        <p><strong>Risco:</strong> ${esc(r.risk)}</p>
        <p><strong>Como desfazer:</strong> ${esc(r.howToUndo)}</p>
        <p><strong>Como medir se houve melhora:</strong> ${esc(r.howToMeasureImprovement)}</p>
      </div>`
    )
    .join('\n');

  const hwRowsHtml = hardwareTable
    .map(
      (h) => `
      <tr>
        <td>${esc(h.componentName)}</td>
        <td>${esc(h.expectedTargetSpec)}</td>
        <td>${esc(sanitizePersonalPaths(h.detectedInActiveSessionLog, sanitize))}</td>
        <td>${esc(sanitizePersonalPaths(h.detectedLiveEnvironment, sanitize))}</td>
        <td>${esc(h.technicalNote)}</td>
      </tr>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Relatório Técnico — Iris Xe Diagnostic Suite — ${esc(session.name)}</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0b0f17; color: #e2e8f0; margin: 24px; line-height: 1.5; }
    h1, h2, h3 { color: #f8fafc; margin-top: 24px; }
    .banner { padding: 12px 16px; border: 1px solid #f59e0b; background: rgba(245, 158, 11, 0.12); border-radius: 6px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .metric { background: #131b29; border: 1px solid #233047; padding: 12px; border-radius: 6px; }
    .metric-label { font-size: 12px; color: #94a3b8; }
    .metric-val { font-size: 20px; font-weight: 700; font-family: Consolas, monospace; color: #38bdf8; margin-top: 4px; }
    .card { background: #131b29; border: 1px solid #233047; padding: 16px; border-radius: 6px; margin-bottom: 12px; }
    .card-header { display: flex; justify-content: space-between; border-bottom: 1px solid #1e293b; padding-bottom: 8px; margin-bottom: 8px; }
    .badge { font-family: Consolas, monospace; font-size: 12px; color: #fbbf24; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { border: 1px solid #233047; padding: 8px 10px; text-align: left; }
    th { background: #182234; color: #cbd5e1; }
  </style>
</head>
<body>
  <h1>IRIS XE DIAGNOSTIC SUITE — Relatório de Investigação Técnica</h1>
  <p><strong>Sessão:</strong> ${esc(sanitizePersonalPaths(session.name, sanitize))} · <strong>Gerado em:</strong> ${esc(new Date().toISOString())}</p>
  <p><strong>Driver:</strong> ${esc(session.driverVersion)} · <strong>SO:</strong> ${esc(session.osVersion)} · <strong>Monitor:</strong> ${esc(session.resolution)} @ ${esc(session.monitorRefreshHz)} Hz</p>
  ${
    session.isSimulated
      ? `<div class="banner"><strong>AVISO DE TRANSPARÊNCIA (DADOS DE REFERÊNCIA / SIMULADOS):</strong> ${esc(session.simulationNotice)}</div>`
      : ''
  }

  <h2>1. Métricas Principais de Desempenho e Apresentação</h2>
  <div class="grid">
    <div class="metric"><div class="metric-label">FPS Médio</div><div class="metric-val">${esc(session.stats.avgFps)} FPS</div></div>
    <div class="metric"><div class="metric-label">1% Low FPS (P99)</div><div class="metric-val">${esc(session.stats.fps1PercentLow)} FPS</div></div>
    <div class="metric"><div class="metric-label">0,1% Low FPS (P99,9)</div><div class="metric-val">${esc(session.stats.fps0_1PercentLow)} FPS</div></div>
    <div class="metric"><div class="metric-label">Frametime Médio / P99</div><div class="metric-val">${esc(session.stats.avgFrametimeMs)} / ${esc(session.stats.p99FrametimeMs)} ms</div></div>
    <div class="metric"><div class="metric-label">Eventos de Stuttering</div><div class="metric-val">${esc(session.stats.stutterEventsCount)} (${esc(session.stats.totalStutterDurationMs)} ms)</div></div>
    <div class="metric"><div class="metric-label">Clock GPU Iris Xe (Min–Máx)</div><div class="metric-val">${esc(session.stats.gpuClockMinMhz)}–${esc(session.stats.gpuClockMaxMhz)} MHz</div></div>
  </div>

  <h2>2. Diagnóstico Causal e Níveis de Confiança</h2>
  ${findingsHtml}

  <h2>3. Recomendações Seguras e Reversíveis</h2>
  ${recsHtml}

  <h2>4. Auditoria de Hardware (Alvo Positivo Master 4250 vs Detectado)</h2>
  <table>
    <thead>
      <tr>
        <th>Componente</th>
        <th>Especificação Alvo</th>
        <th>Registrado na Sessão</th>
        <th>Ambiente Local Detectado</th>
        <th>Observação Técnica</th>
      </tr>
    </thead>
    <tbody>
      ${hwRowsHtml}
    </tbody>
  </table>

  <h2>5. Limitações Declaradas e Garantias de Segurança</h2>
  <ul>
    <li>Operações de escrita em hardware/sistema realizadas: <strong>0 (Somente Leitura)</strong>.</li>
    <li>Dados ausentes preservados como nulos (nunca convertidos em zero).</li>
    <li>Sanitização de caminhos pessoais ativa: <strong>${sanitize ? 'Sim' : 'Não'}</strong>.</li>
  </ul>
</body>
</html>`;
}

async function computeSha256Hex(content: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return 'sha256-indisponivel-neste-runtime';
}

export async function generateDiagnosticZipPackage(
  session: DiagnosticSession,
  hardwareTable: HardwareComponentComparison[],
  options: { sanitizePii?: boolean } = {}
): Promise<{ blob: Blob; fileHashes: Record<string, string> }> {
  const csvContent = generateSynchronizedCsv(session, options);
  const jsonContent = generateDiagnosticJson(session, hardwareTable, options);
  const htmlContent = generateDiagnosticHtmlReport(session, hardwareTable, options);

  const methodologyTxt = [
    'IRIS XE DIAGNOSTIC SUITE v2.0 — PACOTE DE DIAGNÓSTICO TÉCNICO',
    `Data de geração (UTC): ${new Date().toISOString()}`,
    `Sessão: ${session.name}`,
    `Modo Simulado/Referência: ${session.isSimulated ? 'SIM' : 'NÃO (Medição importada pelo usuário)'}`,
    `Sanitização de PII aplicada: ${options.sanitizePii !== false ? 'SIM' : 'NÃO'}`,
    '',
    'GARANTIAS DE SEGURANÇA:',
    '- Zero operações WRMSR, MMIO, PCI Config ou alteração de registro/sistema.',
    '- Nenhum envio automático para nuvem ou servidores externos.',
  ].join('\r\n');

  const fileHashes: Record<string, string> = {
    'telemetria-sincronizada.csv': await computeSha256Hex(csvContent),
    'diagnostico-completo.json': await computeSha256Hex(jsonContent),
    'relatorio-tecnico.html': await computeSha256Hex(htmlContent),
    'LEIAME-SEGURANCA-E-LIMITACOES.txt': await computeSha256Hex(methodologyTxt),
  };

  const sha256SumsTxt =
    Object.entries(fileHashes)
      .map(([fname, hash]) => `${hash}  ${fname}`)
      .join('\r\n') + '\r\n';

  const zip = new JSZip();
  zip.file('telemetria-sincronizada.csv', csvContent);
  zip.file('diagnostico-completo.json', jsonContent);
  zip.file('relatorio-tecnico.html', htmlContent);
  zip.file('LEIAME-SEGURANCA-E-LIMITACOES.txt', methodologyTxt);
  zip.file('SHA256SUMS.txt', sha256SumsTxt);

  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, fileHashes };
}
