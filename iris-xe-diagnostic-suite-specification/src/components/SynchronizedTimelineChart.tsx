import React, { useMemo, useState } from 'react';
import { SynchronizedTelemetryPoint } from '../core/types';

export type OverlayMetricKey =
  | 'frametimeMs'
  | 'gpuClockMhz'
  | 'cpuEffectiveClockMhz'
  | 'cpuTempC'
  | 'cpuPackagePowerW'
  | 'gpuUsagePct';

interface MetricDefinition {
  key: OverlayMetricKey;
  label: string;
  unit: string;
  source: string;
  color: string;
  minDomain: number;
  maxDomain: number;
}

export const OVERLAY_METRICS: ReadonlyArray<MetricDefinition> = [
  {
    key: 'frametimeMs',
    label: 'Frametime Médio Janela',
    unit: 'ms',
    source: 'PresentMon CSV',
    color: '#38bdf8', // Sky blue
    minDomain: 0,
    maxDomain: 45,
  },
  {
    key: 'gpuClockMhz',
    label: 'Frequência GPU Iris Xe',
    unit: 'MHz',
    source: 'HWiNFO64 CSV',
    color: '#a855f7', // Purple
    minDomain: 300,
    maxDomain: 1450,
  },
  {
    key: 'cpuEffectiveClockMhz',
    label: 'Clock Efetivo CPU',
    unit: 'MHz',
    source: 'HWiNFO64 CSV',
    color: '#10b981', // Emerald
    minDomain: 500,
    maxDomain: 4300,
  },
  {
    key: 'cpuTempC',
    label: 'Temperatura Package CPU',
    unit: '°C',
    source: 'HWiNFO64 CSV',
    color: '#ef4444', // Red
    minDomain: 40,
    maxDomain: 105,
  },
  {
    key: 'cpuPackagePowerW',
    label: 'Potência Package (PL1/PL2)',
    unit: 'W',
    source: 'HWiNFO64 CSV',
    color: '#f59e0b', // Amber
    minDomain: 0,
    maxDomain: 35,
  },
  {
    key: 'gpuUsagePct',
    label: 'Utilização GPU D3D',
    unit: '%',
    source: 'HWiNFO64 CSV',
    color: '#ec4899', // Pink
    minDomain: 0,
    maxDomain: 100,
  },
];

interface Props {
  stream: SynchronizedTelemetryPoint[];
  initialActiveMetrics?: OverlayMetricKey[];
}

export const SynchronizedTimelineChart: React.FC<Props> = ({
  stream,
  initialActiveMetrics = ['frametimeMs', 'gpuClockMhz', 'cpuTempC', 'cpuPackagePowerW'],
}) => {
  const [activeKeys, setActiveKeys] = useState<OverlayMetricKey[]>(initialActiveMetrics);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const toggleMetric = (key: OverlayMetricKey) => {
    setActiveKeys((prev) =>
      prev.includes(key)
        ? prev.length > 1
          ? prev.filter((k) => k !== key)
          : prev
        : [...prev, key]
    );
  };

  const width = 920;
  const height = 270;
  const padLeft = 48;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const minTime = stream.length > 0 ? stream[0].timeSeconds : 0;
  const maxTime =
    stream.length > 1 ? stream[stream.length - 1].timeSeconds : minTime + 1;

  const xForIndex = (idx: number) => {
    if (stream.length <= 1) return padLeft;
    const t = stream[idx].timeSeconds;
    return padLeft + ((t - minTime) / Math.max(0.001, maxTime - minTime)) * plotW;
  };

  const polylines = useMemo(() => {
    return OVERLAY_METRICS.filter((m) => activeKeys.includes(m.key)).map((metric) => {
      const segments: string[] = [];
      let currentPts: string[] = [];

      stream.forEach((pt, idx) => {
        const rawVal = pt[metric.key];
        if (rawVal === null || rawVal === undefined || !Number.isFinite(rawVal)) {
          // Never convert missing data to zero: break polyline on missing samples!
          if (currentPts.length > 1) {
            segments.push(currentPts.join(' '));
          }
          currentPts = [];
          return;
        }
        const x = xForIndex(idx);
        const clamped = Math.max(metric.minDomain, Math.min(metric.maxDomain, rawVal));
        const norm = (clamped - metric.minDomain) / (metric.maxDomain - metric.minDomain);
        const y = padTop + plotH - norm * plotH;
        currentPts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      });

      if (currentPts.length > 1) {
        segments.push(currentPts.join(' '));
      }

      return {
        metric,
        segments,
      };
    });
  }, [stream, activeKeys, minTime, maxTime]);

  const hoveredPoint =
    hoverIdx !== null && stream[hoverIdx]
      ? stream[hoverIdx]
      : stream[Math.floor(stream.length / 2)] ?? null;

  if (stream.length === 0) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-6 text-center text-slate-400 text-sm">
        Nenhum ponto sincronizado disponível para renderização gráfica.
      </div>
    );
  }

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Eixo Temporal Sincronizado Multi-Indicador (Correlação Visual Direta)
          </h3>
          <p className="text-xs text-slate-400">
            Clique nos indicadores para sobrepor no mesmo eixo temporal (0–100% normalizado por escala individual; dados ausentes interrompem a linha sem cair para zero).
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {OVERLAY_METRICS.map((m) => {
            const active = activeKeys.includes(m.key);
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => toggleMetric(m.key)}
                className={`px-2.5 py-1 rounded text-xs font-mono border transition flex items-center gap-1.5 ${
                  active
                    ? 'bg-slate-800 text-slate-100 border-slate-600'
                    : 'bg-slate-950/60 text-slate-500 border-slate-800/80 hover:text-slate-300'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{ backgroundColor: active ? m.color : '#475569' }}
                />
                <span>{m.label}</span>
                <span className="text-[10px] text-slate-400">({m.unit})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SVG Plot */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none bg-slate-950/80 rounded border border-slate-800/90"
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Horizontal grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padTop + plotH - frac * plotH;
            return (
              <g key={frac}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray="3 3"
                />
                <text
                  x={padLeft - 6}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[10px] font-mono"
                >
                  {Math.round(frac * 100)}%
                </text>
              </g>
            );
          })}

          {/* Highlight Thermal Throttling & Stuttering Windows */}
          {stream.map((pt, idx) => {
            const x = xForIndex(idx);
            const bandW = Math.max(4, plotW / Math.max(10, stream.length));
            if (pt.cpuThermalThrottling) {
              return (
                <rect
                  key={`th-${idx}`}
                  x={x - bandW / 2}
                  y={padTop}
                  width={bandW}
                  height={plotH}
                  fill="rgba(239, 68, 68, 0.13)"
                />
              );
            }
            return null;
          })}

          {/* Stutter markers */}
          {stream.map((pt, idx) => {
            if (!pt.stutterEventActive) return null;
            const x = xForIndex(idx);
            return (
              <line
                key={`st-${idx}`}
                x1={x}
                y1={padTop}
                x2={x}
                y2={padTop + plotH}
                stroke="rgba(245, 158, 11, 0.55)"
                strokeWidth={2}
                strokeDasharray="2 2"
              />
            );
          })}

          {/* Polylines for each active metric */}
          {polylines.map(({ metric, segments }) =>
            segments.map((pts, sIdx) => (
              <polyline
                key={`${metric.key}-${sIdx}`}
                fill="none"
                stroke={metric.color}
                strokeWidth={2.2}
                points={pts}
              />
            ))
          )}

          {/* Hover vertical cursor */}
          {hoveredPoint && (
            <line
              x1={xForIndex(hoveredPoint.windowIndex)}
              y1={padTop}
              x2={xForIndex(hoveredPoint.windowIndex)}
              y2={padTop + plotH}
              stroke="#94a3b8"
              strokeWidth={1.2}
            />
          )}

          {/* Time axis ticks */}
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((frac) => {
            const idx = Math.min(
              stream.length - 1,
              Math.floor(frac * (stream.length - 1))
            );
            const pt = stream[idx];
            if (!pt) return null;
            const x = xForIndex(idx);
            return (
              <text
                key={frac}
                x={x}
                y={height - 10}
                textAnchor="middle"
                className="fill-slate-400 text-[10px] font-mono"
              >
                {pt.timeSeconds.toFixed(1)}s
              </text>
            );
          })}

          {/* Invisible hit-boxes for smooth scrubbing */}
          {stream.map((pt, idx) => {
            const x = xForIndex(idx);
            const sliceW = plotW / Math.max(1, stream.length);
            return (
              <rect
                key={`hit-${pt.windowIndex}`}
                x={x - sliceW / 2}
                y={padTop}
                width={Math.max(4, sliceW)}
                height={plotH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIdx(idx)}
              />
            );
          })}
        </svg>
      </div>

      {/* Synchronized Inspector Readout Bar */}
      {hoveredPoint && (
        <div className="mt-3 bg-slate-950/90 border border-slate-800 rounded p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-3 font-mono">
              <span className="text-sky-400 font-semibold">
                Janela #{hoveredPoint.windowIndex} · t = {hoveredPoint.timeSeconds.toFixed(2)}s
              </span>
              <span className="text-slate-400">UTC: {hoveredPoint.timestampUtc}</span>
              {hoveredPoint.temporalDeltaMs !== null && (
                <span className="text-slate-400">
                  Δ Alinhamento PresentMon↔HWiNFO: {hoveredPoint.temporalDeltaMs} ms
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hoveredPoint.cpuThermalThrottling && (
                <span className="px-2 py-0.5 rounded bg-red-950/90 border border-red-700 text-red-200 text-[11px] font-mono">
                  THERMAL THROTTLING ATIVO (Faixa Vermelha)
                </span>
              )}
              {hoveredPoint.stutterEventActive && (
                <span className="px-2 py-0.5 rounded bg-amber-950/90 border border-amber-700 text-amber-200 text-[11px] font-mono">
                  PICO DE STUTTERING (Linha Tracejada Âmbar)
                </span>
              )}
              {hoveredPoint.tearingRiskActive && (
                <span className="px-2 py-0.5 rounded bg-purple-950/90 border border-purple-700 text-purple-200 text-[11px] font-mono">
                  FLIP DESACOPLADO (SyncInterval=0 / Tearing)
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            {OVERLAY_METRICS.map((m) => {
              const val = hoveredPoint[m.key];
              return (
                <div
                  key={m.key}
                  className="bg-slate-900/90 border border-slate-800/80 rounded px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: m.color }}
                    />
                    <span className="truncate">{m.label}</span>
                  </div>
                  <div className="font-mono font-bold text-sm text-slate-100 mt-0.5">
                    {val !== null && val !== undefined ? `${val} ${m.unit}` : 'Ausente (null)'}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">Fonte: {m.source}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
