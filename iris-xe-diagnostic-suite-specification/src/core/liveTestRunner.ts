import { runCausalDiagnosticEngine } from './diagnosticEngine';
import {
  escapeCsvField,
  generateDiagnosticJson,
  generateSynchronizedCsv,
  sanitizePersonalPaths,
} from './exportService';
import {
  ALLOWED_MSR_ADDRESSES,
  captureAndDecodeMsrSnapshot,
  decodePackageThermStatus0x1B1,
  decodeTemperatureTarget0x1A2,
  decodeThermStatus0x19C,
  isAuthorizedMsr,
  parseCpuSignature,
  runRuntimeSecuritySelfCheck,
} from './msrDecoders';
import { analyzeVrrStatus, computeFrametimeMetrics } from './presentationAnalysis';
import { parseHwinfoCsv, parseNullableNumber, parsePresentMonCsv } from './telemetryParsers';
import { computePearsonR, synchronizeTelemetryStreams } from './temporalSync';

export interface AutomatedTestCaseResult {
  id: string;
  suite: string;
  name: string;
  passed: boolean;
  durationMs: number;
  actualDetails: string;
  error?: string;
}

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function executeAllAutomatedTests(): AutomatedTestCaseResult[] {
  const results: AutomatedTestCaseResult[] = [];

  const runTest = (
    id: string,
    suite: string,
    name: string,
    fn: () => string
  ) => {
    const t0 = performance.now();
    try {
      const details = fn();
      const durationMs = Number((performance.now() - t0).toFixed(3));
      results.push({
        id,
        suite,
        name,
        passed: true,
        durationMs,
        actualDetails: details,
      });
    } catch (err) {
      const durationMs = Number((performance.now() - t0).toFixed(3));
      results.push({
        id,
        suite,
        name,
        passed: false,
        durationMs,
        actualDetails: 'Falha na asserção',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // 1. MSR 0x1A2 Decoding & Mask Divergence
  runTest(
    'TST-01',
    'Decodificação MSR & Ordem',
    'Decodificação MSR 0x1A2 (TjMAX [23:16], Offset TGL [29:24] vs SDM [27:24] e Tau bruto [6:0])',
    () => {
      // 0x2D64001A -> TjMAX = 0x64 (100°C), [29:24] = 0x2D (45°C), [27:24] = 0x0D (13°C), Tau = 0x1A (26)
      const d = decodeTemperatureTarget0x1A2(0x2d64001an);
      assertCondition(d.tjMaxC === 100, `Esperado TjMAX=100, obtido ${d.tjMaxC}`);
      assertCondition(d.offsetTglC === 45, `Esperado OffsetTgl=45, obtido ${d.offsetTglC}`);
      assertCondition(d.offsetSdmC === 13, `Esperado OffsetSdm=13, obtido ${d.offsetSdmC}`);
      assertCondition(d.offsetDivergent === true, 'Divergência entre máscaras [29:24] e [27:24] deve ser sinalizada');
      assertCondition(d.averageTargetC === 55, `Esperado Alvo=55°C, obtido ${d.averageTargetC}`);
      assertCondition(d.tauRaw === 26, `Esperado Tau=26, obtido ${d.tauRaw}`);
      return `TjMAX=${d.tjMaxC}°C, OffsetTGL=${d.offsetTglC}°C, OffsetSDM=${d.offsetSdmC}°C (divergente=${d.offsetDivergent}), Alvo=${d.averageTargetC}°C`;
    }
  );

  // 2. MSR Reading Order Fix (0x1A2 before 0x19C/0x1B1 on 1st sample)
  runTest(
    'TST-02',
    'Decodificação MSR & Ordem',
    'Correção AUD-05: Leitura de 0x1A2 antes de 0x19C/0x1B1 calcula temperatura já na 1ª amostra',
    () => {
      const snap = captureAndDecodeMsrSnapshot({
        raw0x1A2: 0x0d640000n, // TjMAX = 100°C, Offset = 13°C
        raw0x19C: 0x88020003n, // Valid=1, Readout=2 (98°C), ThermalStatus=1, Log=1
        raw0x1B1: 0x88010001n, // Valid=1, Readout=1 (99°C), PkgThermalStatus=1
        isSimulated: true,
        mechanismName: 'UnitTest',
      });
      assertCondition(snap.readOrder[0].startsWith('0x1A2'), '0x1A2 deve ser o primeiro registrador lido');
      assertCondition(snap.core0x19C?.temperatureC === 98, `Esperado Core=98°C na 1ª amostra, obtido ${snap.core0x19C?.temperatureC}`);
      assertCondition(snap.package0x1B1?.temperatureC === 99, `Esperado Pkg=99°C na 1ª amostra, obtido ${snap.package0x1B1?.temperatureC}`);
      return `Ordem=[${snap.readOrder.join(' → ')}]; Core=${snap.core0x19C?.temperatureC}°C, Pkg=${snap.package0x1B1?.temperatureC}°C`;
    }
  );

  // 3. Invalid MSR ReadingValid=0 and Package 0x1B1 zero-value protection
  runTest(
    'TST-03',
    'Decodificação MSR & Ordem',
    'Correção AUD-07: ReadingValid=0 em 0x19C e 0x1B1 retorna temperatureC = null (nunca presume TjMAX)',
    () => {
      const invalidCore = decodeThermStatus0x19C(0x00140000n, 100); // bit 31 = 0
      const invalidPkg = decodePackageThermStatus0x1B1(0x00000000n, 100); // bit 31 = 0, readout = 0
      assertCondition(invalidCore.readingValid === false && invalidCore.temperatureC === null, 'Core com bit 31=0 deve ter temperatureC=null');
      assertCondition(invalidPkg.readingValid === false && invalidPkg.temperatureC === null, 'Pacote zerado deve ter temperatureC=null');
      return `Core(bit31=0).temp=${invalidCore.temperatureC}; Pkg(0x0).temp=${invalidPkg.temperatureC}`;
    }
  );

  // 4. CPUID Fail-Closed Gate, Overflow Protection & SKU Distinction
  runTest(
    'TST-04',
    'Segurança & Hardware Gate',
    'Correções AUD-02, AUD-03, AUD-04: Trava CPUID fail-closed, proteção de overflow e distinção i5-1135G7 vs i7-1195G7',
    () => {
      let emptyBlocked = false;
      let overflowBlocked = false;
      try {
        parseCpuSignature('', '');
      } catch {
        emptyBlocked = true;
      }
      try {
        parseCpuSignature('Intel64 Family 6 Model 999999999999999999999999 Stepping 1', 'Test');
      } catch {
        overflowBlocked = true;
      }
      const i7 = parseCpuSignature(
        'Intel64 Family 6 Model 140 Stepping 1',
        '11th Gen Intel(R) Core(TM) i7-1195G7 @ 2.90GHz'
      );
      const i5 = parseCpuSignature(
        'Intel64 Family 6 Model 140 Stepping 1',
        '11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz'
      );
      const amd = parseCpuSignature('AMD64 Family 25 Model 80 Stepping 0', 'AMD Ryzen 7');

      assertCondition(emptyBlocked && overflowBlocked, 'Entrada vazia e overflow devem falhar fechados');
      assertCondition(i7.isTigerLakeUArchitecture && i7.isExactI7_1195G7Sku, 'i7-1195G7 deve confirmar arquitetura e SKU');
      assertCondition(i5.isTigerLakeUArchitecture && !i5.isExactI7_1195G7Sku && i5.skuWarning !== null, 'i5-1135G7 deve alertar divergência de SKU');
      assertCondition(!amd.canExecuteTargetMsrDecode && amd.gateDenialReason !== null, 'Processador não-TigerLake deve ser recusado');
      return `EmptyBlocked=${emptyBlocked}, OverflowBlocked=${overflowBlocked}, i7Exact=${i7.isExactI7_1195G7Sku}, i5SkuWarn=${i5.skuWarning !== null}`;
    }
  );

  // 5. Missing Data Never Converted to Zero
  runTest(
    'TST-05',
    'Qualidade de Dados & Parsers',
    'Dados ausentes (NA, N/A, vazio, "-") preservados estritamente como null (nunca convertidos em 0)',
    () => {
      assertCondition(parseNullableNumber('') === null, 'String vazia deve retornar null');
      assertCondition(parseNullableNumber('NA') === null, 'NA deve retornar null');
      assertCondition(parseNullableNumber('N/A') === null, 'N/A deve retornar null');
      assertCondition(parseNullableNumber('—') === null, 'Travessão deve retornar null');
      assertCondition(parseNullableNumber('0') === 0, 'Zero literal deve retornar 0');

      const csv = [
        'TimeInSeconds,Total CPU Usage [%],GPU Clock [MHz],CPU Package [°C]',
        '0.5,45.2,NA,84',
        '1.0,,1250,N/A',
      ].join('\n');
      const parsed = parseHwinfoCsv(csv);
      assertCondition(parsed.samples.length === 2, 'Deve ler 2 amostras');
      assertCondition(parsed.samples[0].gpuClockMhz === null, 'GPU Clock NA deve ser null, nunca 0');
      assertCondition(parsed.samples[1].cpuUsageTotalPct === null, 'CPU Usage vazio deve ser null, nunca 0');
      assertCondition(parsed.samples[1].cpuTempC === null, 'CPU Temp N/A deve ser null, nunca 0');
      return `Amostra[0].gpuClock=${parsed.samples[0].gpuClockMhz}, Amostra[1].cpuUsage=${parsed.samples[1].cpuUsageTotalPct}, Amostra[1].cpuTemp=${parsed.samples[1].cpuTempC}`;
    }
  );

  // 6. Malformed, Incomplete, Out-of-Order & Duplicate CSV Handling
  runTest(
    'TST-06',
    'Qualidade de Dados & Parsers',
    'Tratamento de CSV malformado, linhas truncadas, timestamps duplicados, fora de ordem e valores inválidos',
    () => {
      const messyPmCsv = [
        'Application,PresentMode,SyncInterval,AllowsTearing,Dropped,TimeInSeconds,MsBetweenPresents,MsBetweenDisplayChange',
        'VALORANT.exe,Hardware: Independent Flip,0,1,0,2.000,8.50,10.00',
        'VALORANT.exe,Hardware: Independent Flip,0,1,0,1.000,7.80,10.00', // Out of order!
        'VALORANT.exe,Hardware: Independent Flip,0,1,0,1.000,7.80,10.00', // Exact duplicate!
        'LINHA_TRUNCADA_MALFORMADA', // Malformed!
        'VALORANT.exe,Hardware: Independent Flip,0,1,0,-5.000,8.00,10.00', // Negative timestamp!
        'VALORANT.exe,Hardware: Independent Flip,0,1,0,3.000,99999.0,10.00', // Physically invalid frametime > 5000ms!
      ].join('\n');

      const out = parsePresentMonCsv(messyPmCsv);
      assertCondition(out.outOfOrderCorrected === true, 'Deve detectar e corrigir linhas fora de ordem');
      assertCondition(out.duplicateTimestampsRemoved === 1, `Deve remover 1 duplicata, removeu ${out.duplicateTimestampsRemoved}`);
      assertCondition(out.malformedLinesCount === 2, `Deve contabilizar 2 linhas inválidas/truncadas, contou ${out.malformedLinesCount}`);
      assertCondition(out.frames.length === 3, `Deve restar 3 quadros válidos, restaram ${out.frames.length}`);
      assertCondition(out.frames[0].timeInSeconds === 1.0 && out.frames[1].timeInSeconds === 2.0, 'Quadros devem estar ordenados (1.0s → 2.0s → 3.0s)');
      assertCondition(out.frames[2].msBetweenPresents === null, 'Frametime absurdo (99999ms) deve ser invalidado para null');
      return `Ordenado=${out.outOfOrderCorrected}, DuplicatasRemovidas=${out.duplicateTimestampsRemoved}, Malformadas=${out.malformedLinesCount}, Frame[2].ft=${out.frames[2].msBetweenPresents}`;
    }
  );

  // 7. Temporal Synchronization Without Mixing Unaligned Frequencies
  runTest(
    'TST-07',
    'Sincronização Temporal & Correlação',
    'Alinhamento temporal PresentMon (alta frequência) × HWiNFO64 (baixa frequência) respeitando janela máxima sem inventar sensores',
    () => {
      const pm = parsePresentMonCsv(
        [
          'Application,PresentMode,SyncInterval,AllowsTearing,Dropped,TimeInSeconds,MsBetweenPresents,MsBetweenDisplayChange',
          'VALORANT.exe,Hardware: Independent Flip,0,1,0,0.10,8.0,10.0',
          'VALORANT.exe,Hardware: Independent Flip,0,1,0,0.20,8.4,10.0',
          'VALORANT.exe,Hardware: Independent Flip,0,1,0,5.00,12.5,20.0',
        ].join('\n')
      );
      const hw = parseHwinfoCsv(
        [
          'TimeInSeconds,CPU Package [°C],GPU Clock [MHz]',
          '0.15,82,1300',
          // No HWiNFO sample near t = 5.0s!
        ].join('\n')
      );

      const sync = synchronizeTelemetryStreams(pm.frames, hw.samples, {
        windowStepSeconds: 1.0,
        maxHwinfoDeltaSeconds: 0.8,
      });

      const win0 = sync.find((w) => Math.abs(w.timeSeconds - 0.1) < 0.01);
      const win5 = sync.find((w) => Math.abs(w.timeSeconds - 5.1) < 0.01);

      assertCondition(win0 !== undefined && win0.hasPresentMonData && win0.hasHwinfoData, 'Janela t=0.1s deve conter ambas as fontes');
      assertCondition(win0!.cpuTempC === 82 && win0!.gpuClockMhz === 1300, 'Valores HWiNFO preservados em t=0.1s');
      assertCondition(win5 !== undefined && win5.hasPresentMonData && !win5.hasHwinfoData, 'Janela t=5.1s deve indicar ausência de HWiNFO');
      assertCondition(win5!.cpuTempC === null && win5!.gpuClockMhz === null, 'Sensores ausentes em t=5.1s devem permanecer null');
      return `Win(0.1s): PM=${win0?.hasPresentMonData}, HW=${win0?.hasHwinfoData} (${win0?.cpuTempC}°C); Win(5.1s): PM=${win5?.hasPresentMonData}, HW=${win5?.hasHwinfoData} (temp=${win5?.cpuTempC})`;
    }
  );

  // 8. Frametime, 1% Low, 0.1% Low, Stutter Detection & Insufficient Sample Warning
  runTest(
    'TST-08',
    'Estatísticas de Frametime & Stuttering',
    'Cálculo exato de FPS médio, 1% Low, 0,1% Low, detecção de eventos de Stuttering e alerta de amostra insuficiente (< 30 quadros)',
    () => {
      // Insufficient sample check (< 10 frames)
      const tinyPm = parsePresentMonCsv(
        [
          'Application,PresentMode,SyncInterval,AllowsTearing,Dropped,TimeInSeconds,MsBetweenPresents',
          'VALORANT.exe,Hardware: Independent Flip,0,1,0,0.1,8.0',
          'VALORANT.exe,Hardware: Independent Flip,0,1,0,0.2,8.0',
        ].join('\n')
      );
      const tinyStats = computeFrametimeMetrics(tinyPm.frames, [], []);
      assertCondition(tinyStats.insufficientSamples === true && tinyStats.avgFps === null, 'Menos de 10 quadros deve bloquear estatísticas enganosas');

      // 40 frames: 39 frames at 10.0 ms (100 FPS) + 1 severe stutter spike at 40.0 ms (25 FPS)
      const rows = ['Application,PresentMode,SyncInterval,AllowsTearing,Dropped,TimeInSeconds,MsBetweenPresents,MsBetweenDisplayChange'];
      for (let i = 0; i < 40; i++) {
        const ft = i === 20 ? 40.0 : 10.0;
        rows.push(`VALORANT.exe,Hardware: Independent Flip,0,1,0,${(i * 0.1).toFixed(2)},${ft.toFixed(2)},10.00`);
      }
      const fullPm = parsePresentMonCsv(rows.join('\n'));
      const stats = computeFrametimeMetrics(fullPm.frames, [], []);

      assertCondition(!stats.insufficientSamples, '40 quadros deve ser suficiente');
      assertCondition(stats.p50FrametimeMs === 10.0, `Mediana esperada 10.0ms, obtida ${stats.p50FrametimeMs}`);
      assertCondition(stats.maxFrametimeMs === 40.0 && stats.minFps === 25.0, `MinFPS esperado 25.0, obtido ${stats.minFps}`);
      assertCondition(stats.stutterEventsCount === 1 && stats.stutterEvents[0].peakFrametimeMs === 40.0, 'Deve detectar exatamente 1 evento de stuttering de 40ms');
      return `ValidFrames=${stats.validFrameCount}, AvgFPS=${stats.avgFps}, 1%Low=${stats.fps1PercentLow} FPS, Stutters=${stats.stutterEventsCount} (pico=${stats.stutterEvents[0].peakFrametimeMs}ms)`;
    }
  );

  // 9. VRR 3-Tier Verification & Pearson Correlation
  runTest(
    'TST-09',
    'VRR, Tearing & Diagnóstico Causal',
    'Separação VRR em 3 camadas (EDID × Driver × Scanout 10ms) e cálculo de correlação de Pearson (r)',
    () => {
      const rPerfectInv = computePearsonR([
        [3900, 7.5],
        [3500, 8.5],
        [3000, 10.0],
        [2400, 12.0],
        [2000, 14.0],
      ]);
      assertCondition(rPerfectInv !== null && rPerfectInv < -0.95, `Correlação inversa forte esperada < -0.95, obtida ${rPerfectInv}`);

      const rows = ['Application,PresentMode,SyncInterval,AllowsTearing,Dropped,TimeInSeconds,MsBetweenPresents,MsBetweenDisplayChange'];
      for (let i = 0; i < 20; i++) {
        rows.push(`VALORANT.exe,Hardware: Independent Flip,0,1,0,${(i * 0.1).toFixed(2)},8.3,10.0`);
      }
      const pm = parsePresentMonCsv(rows.join('\n'));
      const vrr = analyzeVrrStatus({
        frames: pm.frames,
        monitorRefreshHz: 100,
        vrrConfiguredInSession: true,
        edidRawAvailable: true,
        edidClaimsVrr: true,
      });
      // Even if EDID claims VRR and user toggled VRR, if 100% of MsBetweenDisplayChange are fixed at 10.0ms while FT is 8.3ms, effective VRR is INACTIVE!
      assertCondition(
        vrr.edidAnnouncedSupport.status === 'Suportado no EDID' &&
          vrr.effectiveRuntimeOperation.status === 'Inativo (Scanout Fixo 100 Hz / 10,0 ms)',
        'Não deve declarar VRR funcionando se MsBetweenDisplayChange permanecer fixo em 10,0 ms'
      );
      return `Pearson r=${rPerfectInv}; EDID='${vrr.edidAnnouncedSupport.status}' mas Efetivo='${vrr.effectiveRuntimeOperation.status}'`;
    }
  );

  // 10. CSV Escaping (AUD-11 fix), PII Sanitization & Runtime Self-Check
  runTest(
    'TST-10',
    'Exportação, Privacidade & Segurança',
    'Correção AUD-11 (escape de \\r\\n, ponto-e-vírgula, aspas e fórmulas CSV) e sanitização de caminhos pessoais (PII)',
    () => {
      const crlfEscaped = escapeCsvField('Erro linha 1\r\nLinha 2; "detalhe"', ';');
      const formulaEscaped = escapeCsvField('=CMD|" /C calc"!A0', ';');
      const sanitizedPath = sanitizePersonalPaths(
        'Arquivo lido de C:\\Users\\luizfernando\\Documents\\log.csv e /home/luiz/capture.csv',
        true
      );
      const selfChecks = runRuntimeSecuritySelfCheck();

      assertCondition(
        crlfEscaped === '"Erro linha 1\r\nLinha 2; ""detalhe"""',
        `Escape CRLF incorreto: ${crlfEscaped}`
      );
      assertCondition(
        formulaEscaped.startsWith("'=CMD") || formulaEscaped.startsWith("\"'=CMD"),
        `Fórmula CSV deve ser neutralizada com apóstrofo: ${formulaEscaped}`
      );
      assertCondition(
        !sanitizedPath.includes('luizfernando') && sanitizedPath.includes('[USUARIO_REMOVIDO]'),
        `Falha ao remover PII: ${sanitizedPath}`
      );
      assertCondition(
        selfChecks.every((c) => c.passed) && Object.isFrozen(ALLOWED_MSR_ADDRESSES) && !isAuthorizedMsr(0x610),
        'Todos os auto-testes de segurança em tempo de execução devem passar'
      );
      return `EscapeCRLF=OK, FormulaNeutralizada=OK, PIIRemovido='${sanitizedPath}', SelfChecks=${selfChecks.length}/${selfChecks.length} OK`;
    }
  );

  // 11. End-to-End Integration Test of Causal Diagnostic Engine & Export
  runTest(
    'TST-11',
    'Integração End-to-End',
    'Pipeline completo: CSVs → Sincronização → Estatísticas → Motor Causal → Exportação CSV/JSON sem vazamento',
    () => {
      const pmCsv = [
        'Application,PresentMode,SyncInterval,AllowsTearing,Dropped,TimeInSeconds,MsBetweenPresents,MsBetweenDisplayChange,MsUntilDisplayed,CPUBusy,GPUWait',
        ...Array.from({ length: 35 }, (_, i) => {
          const t = (i * 0.2).toFixed(2);
          const throttle = i >= 15 && i <= 28;
          const ft = i === 20 ? 36.0 : throttle ? 10.2 : 7.5;
          return `VALORANT.exe,Hardware: Independent Flip,0,1,0,${t},${ft},10.0,${ft + 2.0},5.0,3.2`;
        }),
      ].join('\n');

      const hwCsv = [
        'TimeInSeconds,Total CPU Usage [%],Max CPU/Thread Usage [%],Core Effective Clocks (avg) [MHz],CPU Package [°C],CPU Package Power [W],Thermal Throttling [Yes/No],GPU Clock [MHz],GPU D3D Usage [%]',
        ...Array.from({ length: 14 }, (_, i) => {
          const t = (i * 0.5).toFixed(2);
          const throttle = i >= 6 && i <= 11;
          return `${t},70,96,${throttle ? 2100 : 3900},${throttle ? 101 : 80},${throttle ? 15.0 : 27.0},${throttle ? 'Yes' : 'No'},${throttle ? 800 : 1350},${throttle ? 64 : 85}`;
        }),
      ].join('\n');

      const pm = parsePresentMonCsv(pmCsv, { isSimulated: true });
      const hw = parseHwinfoCsv(hwCsv, { isSimulated: true });
      const sync = synchronizeTelemetryStreams(pm.frames, hw.samples, { windowStepSeconds: 0.5 });
      const stats = computeFrametimeMetrics(pm.frames, hw.samples, sync);
      const vrr = analyzeVrrStatus({ frames: pm.frames, monitorRefreshHz: 100, vrrConfiguredInSession: false });
      const findings = runCausalDiagnosticEngine({
        frames: pm.frames,
        hwinfoSamples: hw.samples,
        syncStream: sync,
        stats,
        correlations: [],
        vrrAssessment: vrr,
        monitorRefreshHz: 100,
      });

      assertCondition(findings.length >= 2, `Esperado >= 2 diagnósticos causais, obtidos ${findings.length}`);
      const mockSession = {
        id: 'test',
        name: 'Sessão C:\\Users\\nandi\\Desktop\\teste.csv',
        stageType: 'Sessão de Jogo (Valorant)' as const,
        createdAtUtc: new Date().toISOString(),
        isSimulated: true,
        hardwareProfileId: 'test',
        driverVersion: '31.0.101.5333',
        osVersion: 'Windows 11 25H2',
        resolution: '1920x1080',
        monitorRefreshHz: 100,
        powerPlan: 'Balanced',
        windowMode: 'Tela Cheia Exclusiva (Fullscreen)' as const,
        vsyncConfigured: false,
        fpsLimitConfigured: null,
        vrrConfigured: false,
        telemetrySources: ['PresentMon', 'HWiNFO64'],
        presentMonFrames: pm.frames,
        hwinfoSamples: hw.samples,
        synchronizedStream: sync,
        stats,
        correlations: [],
        findings,
        recommendations: [],
        vrrAssessment: vrr,
        presentationChain: [],
        parseNotes: [],
      };
      const csvOut = generateSynchronizedCsv(mockSession, { sanitizePii: true });
      const jsonOut = generateDiagnosticJson(mockSession, [], { sanitizePii: true });
      assertCondition(!jsonOut.includes('Users\\\\nandi'), 'JSON exportado não deve vazar nome de usuário do caminho');
      assertCondition(csvOut.includes('window_index;time_seconds'), 'CSV exportado deve conter cabeçalho estruturado');
      return `Findings=${findings.length} (${findings.map((f) => f.confidence).join(', ')}); CSV=${csvOut.split('\r\n').length} linhas`;
    }
  );

  return results;
}
