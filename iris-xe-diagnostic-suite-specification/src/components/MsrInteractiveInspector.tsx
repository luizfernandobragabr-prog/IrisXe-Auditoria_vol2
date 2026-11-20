import React, { useMemo, useState } from 'react';
import {
  captureAndDecodeMsrSnapshot,
  formatBin64,
  tryParseHex64,
} from '../core/msrDecoders';

export const MsrInteractiveInspector: React.FC = () => {
  // Default realistic vectors from the Positivo Master 4250 (i7-1195G7) under thermal load:
  // 0x1A2 = 0x000000000D640014 -> TjMAX = 100°C (0x64), TCC Offset = 13°C (0x0D) -> Target = 87°C, Tau raw = 20
  // 0x19C = 0x0000000088000803 -> ReadingValid = 1, Readout = 0 (100°C), ThermalStatus = 1, ThermalLog = 1, PowerLimitLog = 1
  // 0x1B1 = 0x0000000088010803 -> ReadingValid = 1, Readout = 1 (99°C), PkgThermalStatus = 1, PkgPowerLimitLog = 1
  const [hex1A2, setHex1A2] = useState('0x000000000D640014');
  const [hex19C, setHex19C] = useState('0x0000000088000803');
  const [hex1B1, setHex1B1] = useState('0x0000000088010803');

  const parsed1A2 = useMemo(() => tryParseHex64(hex1A2), [hex1A2]);
  const parsed19C = useMemo(() => tryParseHex64(hex19C), [hex19C]);
  const parsed1B1 = useMemo(() => tryParseHex64(hex1B1), [hex1B1]);

  const snapshot = useMemo(() => {
    return captureAndDecodeMsrSnapshot({
      raw0x1A2: parsed1A2.ok ? parsed1A2.value : null,
      raw0x19C: parsed19C.ok ? parsed19C.value : null,
      raw0x1B1: parsed1B1.ok ? parsed1B1.value : null,
      isSimulated: true,
      mechanismName: 'Decodificador Manual Auditado (SIMULADO — sem driver kernel)',
    });
  }, [parsed1A2, parsed19C, parsed1B1]);

  const loadPreset = (preset: 'throttling-100c' | 'normal-78c' | 'external-prochot' | 'divergent-mask') => {
    if (preset === 'throttling-100c') {
      setHex1A2('0x000000000D640014');
      setHex19C('0x0000000088000803');
      setHex1B1('0x0000000088010803');
    } else if (preset === 'normal-78c') {
      setHex1A2('0x000000000A640014'); // TjMAX 100, Offset 10 -> Target 90°C
      setHex19C('0x0000000088160000'); // Valid=1, Readout=22 -> 78°C
      setHex1B1('0x0000000088140000'); // Valid=1, Readout=20 -> 80°C
    } else if (preset === 'external-prochot') {
      setHex1A2('0x000000000D640014');
      setHex19C('0x000000008819000C'); // Valid=1, Readout=25 (75°C), bit 2 (PROCHOT Event)=1, bit 3=1, bit 0=0!
      setHex1B1('0x000000008818000C');
    } else if (preset === 'divergent-mask') {
      setHex1A2('0x000000002D64001A'); // [29:24]=45°C vs [27:24]=13°C
      setHex19C('0x0000000088140000');
      setHex1B1('0x0000000088120000');
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-100">
              Decodificador Documentado de Registradores MSR (0x1A2 → 0x19C → 0x1B1)
            </h3>
            <span className="px-2 py-0.5 text-[11px] font-mono bg-amber-950/90 border border-amber-700 text-amber-200 rounded">
              SIMULADO / ENTRADA MANUAL (Zero Escrita / Sem Driver Kernel)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Ordem de leitura corrigida (AUD-05): 1º decodifica <code className="text-sky-300">0x1A2</code> para extrair o <code className="text-sky-300">TjMAX</code> atual, aplicando-o imediatamente a <code className="text-sky-300">0x19C</code> e <code className="text-sky-300">0x1B1</code> já na primeira amostragem.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => loadPreset('throttling-100c')}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            Vetor: Throttling 100 °C + Offset 13
          </button>
          <button
            type="button"
            onClick={() => loadPreset('normal-78c')}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            Vetor: Operação Normal (78 °C)
          </button>
          <button
            type="button"
            onClick={() => loadPreset('external-prochot')}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            Vetor: PROCHOT# Externo (VRM/EC NL40MU1)
          </button>
          <button
            type="button"
            onClick={() => loadPreset('divergent-mask')}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            Vetor: Divergência [29:24] vs [27:24]
          </button>
        </div>
      </div>

      {/* Hex Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-slate-950/80 border border-slate-800 rounded p-3">
          <label className="block text-xs font-semibold text-sky-400 font-mono">
            1º Leitura: MSR 0x1A2 (MSR_TEMPERATURE_TARGET)
          </label>
          <input
            type="text"
            value={hex1A2}
            onChange={(e) => setHex1A2(e.target.value)}
            className="mt-1.5 w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-100"
          />
          {!parsed1A2.ok ? (
            <p className="text-[11px] text-red-400 mt-1">{parsed1A2.error}</p>
          ) : (
            <p className="text-[10px] text-slate-400 font-mono mt-1 break-all">
              Bin: {formatBin64(parsed1A2.value)}
            </p>
          )}
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded p-3">
          <label className="block text-xs font-semibold text-emerald-400 font-mono">
            2º Leitura: MSR 0x19C (IA32_THERM_STATUS — Por LP)
          </label>
          <input
            type="text"
            value={hex19C}
            onChange={(e) => setHex19C(e.target.value)}
            className="mt-1.5 w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-100"
          />
          {!parsed19C.ok ? (
            <p className="text-[11px] text-red-400 mt-1">{parsed19C.error}</p>
          ) : (
            <p className="text-[10px] text-slate-400 font-mono mt-1 break-all">
              Bin: {formatBin64(parsed19C.value)}
            </p>
          )}
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded p-3">
          <label className="block text-xs font-semibold text-purple-400 font-mono">
            3º Leitura: MSR 0x1B1 (MSR_PACKAGE_THERM_STATUS — Pacote)
          </label>
          <input
            type="text"
            value={hex1B1}
            onChange={(e) => setHex1B1(e.target.value)}
            className="mt-1.5 w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-100"
          />
          {!parsed1B1.ok ? (
            <p className="text-[11px] text-red-400 mt-1">{parsed1B1.error}</p>
          ) : (
            <p className="text-[10px] text-slate-400 font-mono mt-1 break-all">
              Bin: {formatBin64(parsed1B1.value)}
            </p>
          )}
        </div>
      </div>

      {/* Decoded Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
        <div className="bg-slate-950/90 border border-slate-800 rounded p-2.5">
          <div className="text-slate-400 text-[11px]">TjMAX [23:16] (0x1A2)</div>
          <div className="text-base font-bold font-mono text-sky-400 mt-0.5">
            {snapshot.target0x1A2 ? `${snapshot.target0x1A2.tjMaxC} °C` : 'Indisponível'}
          </div>
          <div className="text-[10px] text-slate-500">Calibrado em fábrica</div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded p-2.5">
          <div className="text-slate-400 text-[11px]">TCC Offset TGL [29:24]</div>
          <div className="text-base font-bold font-mono text-amber-400 mt-0.5">
            {snapshot.target0x1A2 ? `-${snapshot.target0x1A2.offsetTglC} °C` : '—'}
          </div>
          <div className="text-[10px] text-slate-500">
            SDM [27:24]: {snapshot.target0x1A2 ? `-${snapshot.target0x1A2.offsetSdmC} °C` : '—'}
            {snapshot.target0x1A2?.offsetDivergent ? ' (DIVERGENTE!)' : ''}
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded p-2.5">
          <div className="text-slate-400 text-[11px]">Alvo Médio TCC</div>
          <div className="text-base font-bold font-mono text-slate-100 mt-0.5">
            {snapshot.target0x1A2?.averageTargetC !== null && snapshot.target0x1A2?.averageTargetC !== undefined
              ? `${snapshot.target0x1A2.averageTargetC} °C`
              : '—'}
          </div>
          <div className="text-[10px] text-slate-500">
            Tau [6:0] bruto: {snapshot.target0x1A2?.tauRaw ?? '—'}
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded p-2.5">
          <div className="text-slate-400 text-[11px]">Temp. Núcleo (0x19C)</div>
          <div className="text-base font-bold font-mono text-emerald-400 mt-0.5">
            {snapshot.core0x19C?.temperatureC !== null && snapshot.core0x19C?.temperatureC !== undefined
              ? `${snapshot.core0x19C.temperatureC} °C`
              : 'Leitura Inválida (bit31=0)'}
          </div>
          <div className="text-[10px] text-slate-500">
            Readout: {snapshot.core0x19C?.digitalReadout ?? '—'} °C abaixo de TjMAX
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded p-2.5">
          <div className="text-slate-400 text-[11px]">Temp. Package (0x1B1)</div>
          <div className="text-base font-bold font-mono text-purple-400 mt-0.5">
            {snapshot.package0x1B1?.temperatureC !== null && snapshot.package0x1B1?.temperatureC !== undefined
              ? `${snapshot.package0x1B1.temperatureC} °C`
              : 'Leitura Inválida (bit31=0)'}
          </div>
          <div className="text-[10px] text-slate-500">
            Validado com bit 31 (Corrige AUD-07)
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded p-2.5">
          <div className="text-slate-400 text-[11px]">Flags Correntes (0x19C)</div>
          <div className="text-xs font-mono text-slate-200 mt-0.5">
            Therm: <strong>{snapshot.core0x19C?.thermalStatus ? 'ATIVO' : '0'}</strong> ·
            PROCHOT: <strong>{snapshot.core0x19C?.prochotEvent ? 'ATIVO' : '0'}</strong> ·
            PL: <strong>{snapshot.core0x19C?.powerLimitStatus ? 'ATIVO' : '0'}</strong>
          </div>
          <div className="text-[10px] text-slate-500">
            Logs R/WC0: T={snapshot.core0x19C?.thermalStatusLog ? '1' : '0'} P={snapshot.core0x19C?.prochotLog ? '1' : '0'}
          </div>
        </div>
      </div>

      {/* PROCHOT & Cross-Domain Diagnostic Banner */}
      <div className="bg-slate-950/90 border border-slate-800 rounded p-3 text-xs">
        <span className="font-semibold text-slate-200">Avaliação Combinada PROCHOT# / Throttling (0x19C × 0x1B1): </span>
        <span className="text-sky-300 font-mono">{snapshot.prochotClassification}</span>
      </div>
    </div>
  );
};
