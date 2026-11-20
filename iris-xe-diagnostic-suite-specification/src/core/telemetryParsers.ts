import { HwinfoSensorRow, PresentMonFrameRow } from './types';

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function detectDelimiter(headerLine: string): ',' | ';' {
  const commas = (headerLine.match(/,/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  return semis > commas ? ';' : ',';
}

/**
 * Parses a numeric cell WITHOUT converting missing/empty/NA values to zero.
 */
export function parseNullableNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim().replace(/^"|"$/g, '').trim();
  if (
    trimmed === '' ||
    trimmed.toUpperCase() === 'NA' ||
    trimmed.toUpperCase() === 'N/A' ||
    trimmed.toUpperCase() === 'NULL' ||
    trimmed.toUpperCase() === 'NAN' ||
    trimmed === '-' ||
    trimmed === '—'
  ) {
    return null;
  }
  // Support Brazilian decimal comma only when there is no dot
  const normalized =
    trimmed.includes(',') && !trimmed.includes('.') ? trimmed.replace(',', '.') : trimmed;
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return num;
}

export function parseNullableBoolean(raw: string | undefined): boolean | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim().replace(/^"|"$/g, '').trim().toLowerCase();
  if (trimmed === '' || trimmed === 'na' || trimmed === 'n/a' || trimmed === '-') {
    return null;
  }
  if (trimmed === '1' || trimmed === 'true' || trimmed === 'yes' || trimmed === 'sim') {
    return true;
  }
  if (trimmed === '0' || trimmed === 'false' || trimmed === 'no' || trimmed === 'nao' || trimmed === 'não') {
    return false;
  }
  return null;
}

export interface PresentMonParseOutput {
  frames: PresentMonFrameRow[];
  detectedVersion: 'PresentMon v1' | 'PresentMon v2' | 'Desconhecido';
  warnings: string[];
  malformedLinesCount: number;
  duplicateTimestampsRemoved: number;
  outOfOrderCorrected: boolean;
}

export function parsePresentMonCsv(
  csvContent: string,
  options: { isSimulated?: boolean; baseTimestampUtc?: string } = {}
): PresentMonParseOutput {
  const warnings: string[] = [];
  const isSimulated = options.isSimulated ?? false;
  const baseDateMs = options.baseTimestampUtc
    ? Date.parse(options.baseTimestampUtc)
    : Date.UTC(2026, 2, 15, 18, 0, 0);

  if (!csvContent || !csvContent.trim()) {
    return {
      frames: [],
      detectedVersion: 'Desconhecido',
      warnings: ['Arquivo CSV do PresentMon está vazio.'],
      malformedLinesCount: 0,
      duplicateTimestampsRemoved: 0,
      outOfOrderCorrected: false,
    };
  }

  const rawLines = csvContent
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  if (rawLines.length < 2) {
    return {
      frames: [],
      detectedVersion: 'Desconhecido',
      warnings: ['Arquivo CSV do PresentMon não contém linhas de dados após o cabeçalho.'],
      malformedLinesCount: 0,
      duplicateTimestampsRemoved: 0,
      outOfOrderCorrected: false,
    };
  }

  const delimiter = detectDelimiter(rawLines[0]);
  const headers = splitCsvLine(rawLines[0], delimiter).map((h) => h.replace(/^"|"$/g, '').trim());
  const headerLower = headers.map((h) => h.toLowerCase());

  const findCol = (...candidates: string[]): number => {
    for (const c of candidates) {
      const idx = headerLower.indexOf(c.toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const colApp = findCol('Application', 'ProcessName');
  const colPresentMode = findCol('PresentMode', 'Present Mode');
  const colSyncInterval = findCol('SyncInterval', 'Sync Interval');
  const colPresentFlags = findCol('PresentFlags', 'Present Flags');
  const colAllowsTearing = findCol('AllowsTearing', 'AllowTearing');
  const colDropped = findCol('Dropped', 'WasDropped');
  const colTime = findCol('TimeInSeconds', 'CPUStartTime', 'QPCTime', 'Time');
  const colMsBetweenPresents = findCol('MsBetweenPresents', 'FrameTime', 'MsBetweenAppStart');
  const colMsBetweenDisplayChange = findCol('MsBetweenDisplayChange', 'DisplayedTime');
  const colMsInPresentApi = findCol('MsInPresentAPI');
  const colMsUntilRenderComplete = findCol('MsUntilRenderComplete', 'GPULatency');
  const colMsUntilDisplayed = findCol('MsUntilDisplayed', 'DisplayLatency', 'ClickToPhotonLatency');
  const colCpuBusy = findCol('CPUBusy', 'MsCPUBusy');
  const colCpuWait = findCol('CPUWait', 'MsCPUWait');
  const colGpuLatency = findCol('GPULatency');
  const colGpuTime = findCol('GPUTime', 'MsGPUTime');
  const colGpuBusy = findCol('GPUBusy', 'MsGPUBusy');
  const colGpuWait = findCol('GPUWait', 'MsGPUWait');
  const colDisplayLatency = findCol('DisplayLatency');

  const isV2 = findCol('FrameTime', 'CPUBusy', 'GPUBusy') !== -1;
  const isV1 = findCol('MsBetweenPresents', 'MsUntilDisplayed') !== -1;
  const detectedVersion = isV2 ? 'PresentMon v2' : isV1 ? 'PresentMon v1' : 'Desconhecido';

  if (colTime === -1 && colMsBetweenPresents === -1) {
    warnings.push(
      'Cabeçalho PresentMon inválido: não foram encontradas colunas de tempo (TimeInSeconds/CPUStartTime) nem de frametime (MsBetweenPresents/FrameTime).'
    );
    return {
      frames: [],
      detectedVersion: 'Desconhecido',
      warnings,
      malformedLinesCount: rawLines.length - 1,
      duplicateTimestampsRemoved: 0,
      outOfOrderCorrected: false,
    };
  }

  let malformedLinesCount = 0;
  const parsedRows: PresentMonFrameRow[] = [];

  for (let lineIdx = 1; lineIdx < rawLines.length; lineIdx++) {
    const line = rawLines[lineIdx];
    const cells = splitCsvLine(line, delimiter);

    if (cells.length < Math.min(3, headers.length - 2)) {
      malformedLinesCount++;
      warnings.push(`Linha ${lineIdx + 1}: linha incompleta ou truncada (${cells.length}/${headers.length} colunas). Ignorada.`);
      continue;
    }

    const rowWarnings: string[] = [];
    const timeVal = colTime !== -1 ? parseNullableNumber(cells[colTime]) : null;
    if (timeVal === null || timeVal < 0) {
      malformedLinesCount++;
      warnings.push(`Linha ${lineIdx + 1}: timestamp ausente ou negativo ('${cells[colTime] ?? ''}'). Ignorada.`);
      continue;
    }

    const msBetweenPresents =
      colMsBetweenPresents !== -1 ? parseNullableNumber(cells[colMsBetweenPresents]) : null;
    const validFrametime =
      msBetweenPresents !== null && msBetweenPresents > 0 && msBetweenPresents < 5000
        ? msBetweenPresents
        : null;

    if (msBetweenPresents !== null && validFrametime === null) {
      rowWarnings.push(`Frametime fora de faixa física (${msBetweenPresents} ms) marcado como inválido/ausente.`);
    }

    const isoTime = new Date(baseDateMs + Math.round(timeVal * 1000)).toISOString();

    parsedRows.push({
      frameIndex: parsedRows.length,
      timeInSeconds: timeVal,
      timestampUtc: isoTime,
      application: colApp !== -1 && cells[colApp] ? cells[colApp] : 'VALORANT-Win64-Shipping.exe',
      presentMode: colPresentMode !== -1 && cells[colPresentMode] ? cells[colPresentMode] : 'Não informado',
      syncInterval: colSyncInterval !== -1 ? parseNullableNumber(cells[colSyncInterval]) : null,
      presentFlags: colPresentFlags !== -1 ? parseNullableNumber(cells[colPresentFlags]) : null,
      allowsTearing: colAllowsTearing !== -1 ? parseNullableBoolean(cells[colAllowsTearing]) : null,
      dropped: colDropped !== -1 ? parseNullableBoolean(cells[colDropped]) : null,
      msBetweenPresents: validFrametime,
      msBetweenDisplayChange:
        colMsBetweenDisplayChange !== -1 ? parseNullableNumber(cells[colMsBetweenDisplayChange]) : null,
      msInPresentApi: colMsInPresentApi !== -1 ? parseNullableNumber(cells[colMsInPresentApi]) : null,
      msUntilRenderComplete:
        colMsUntilRenderComplete !== -1 ? parseNullableNumber(cells[colMsUntilRenderComplete]) : null,
      msUntilDisplayed: colMsUntilDisplayed !== -1 ? parseNullableNumber(cells[colMsUntilDisplayed]) : null,
      cpuBusyMs: colCpuBusy !== -1 ? parseNullableNumber(cells[colCpuBusy]) : null,
      cpuWaitMs: colCpuWait !== -1 ? parseNullableNumber(cells[colCpuWait]) : null,
      gpuLatencyMs: colGpuLatency !== -1 ? parseNullableNumber(cells[colGpuLatency]) : null,
      gpuTimeMs: colGpuTime !== -1 ? parseNullableNumber(cells[colGpuTime]) : null,
      gpuBusyMs: colGpuBusy !== -1 ? parseNullableNumber(cells[colGpuBusy]) : null,
      gpuWaitMs: colGpuWait !== -1 ? parseNullableNumber(cells[colGpuWait]) : null,
      displayLatencyMs: colDisplayLatency !== -1 ? parseNullableNumber(cells[colDisplayLatency]) : null,
      isSimulated,
      rawLineNumber: lineIdx + 1,
      parseWarnings: rowWarnings,
    });
  }

  // Check chronological order
  let outOfOrderCorrected = false;
  for (let i = 1; i < parsedRows.length; i++) {
    if (parsedRows[i].timeInSeconds < parsedRows[i - 1].timeInSeconds) {
      outOfOrderCorrected = true;
      break;
    }
  }
  if (outOfOrderCorrected) {
    warnings.push('Amostras fora de ordem cronológica detectadas no PresentMon CSV; ordenação temporal aplicada.');
    parsedRows.sort((a, b) => a.timeInSeconds - b.timeInSeconds);
  }

  // Deduplicate exact timestamps + frame metrics
  const deduped: PresentMonFrameRow[] = [];
  let duplicateTimestampsRemoved = 0;
  for (const row of parsedRows) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      Math.abs(prev.timeInSeconds - row.timeInSeconds) < 1e-7 &&
      prev.msBetweenPresents === row.msBetweenPresents
    ) {
      duplicateTimestampsRemoved++;
      continue;
    }
    deduped.push({ ...row, frameIndex: deduped.length });
  }
  if (duplicateTimestampsRemoved > 0) {
    warnings.push(`${duplicateTimestampsRemoved} quadros duplicados exatos foram removidos.`);
  }

  return {
    frames: deduped,
    detectedVersion,
    warnings,
    malformedLinesCount,
    duplicateTimestampsRemoved,
    outOfOrderCorrected,
  };
}

export interface HwinfoParseOutput {
  samples: HwinfoSensorRow[];
  detectedColumns: string[];
  missingExpectedSensors: string[];
  warnings: string[];
  malformedLinesCount: number;
  duplicateTimestampsRemoved: number;
  outOfOrderCorrected: boolean;
}

export function parseHwinfoCsv(
  csvContent: string,
  options: { isSimulated?: boolean; baseTimestampUtc?: string } = {}
): HwinfoParseOutput {
  const warnings: string[] = [];
  const isSimulated = options.isSimulated ?? false;
  const baseDateMs = options.baseTimestampUtc
    ? Date.parse(options.baseTimestampUtc)
    : Date.UTC(2026, 2, 15, 18, 0, 0);

  if (!csvContent || !csvContent.trim()) {
    return {
      samples: [],
      detectedColumns: [],
      missingExpectedSensors: ['Todos os sensores (arquivo vazio)'],
      warnings: ['Arquivo CSV do HWiNFO64 está vazio.'],
      malformedLinesCount: 0,
      duplicateTimestampsRemoved: 0,
      outOfOrderCorrected: false,
    };
  }

  const rawLines = csvContent
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  if (rawLines.length < 2) {
    return {
      samples: [],
      detectedColumns: [],
      missingExpectedSensors: ['Todos os sensores (sem dados)'],
      warnings: ['Arquivo CSV do HWiNFO64 não possui linhas de dados.'],
      malformedLinesCount: 0,
      duplicateTimestampsRemoved: 0,
      outOfOrderCorrected: false,
    };
  }

  const delimiter = detectDelimiter(rawLines[0]);
  const headers = splitCsvLine(rawLines[0], delimiter).map((h) => h.replace(/^"|"$/g, '').trim());
  const headerLower = headers.map((h) => h.toLowerCase());

  const findHeader = (...patterns: string[]): number => {
    for (const p of patterns) {
      const pLow = p.toLowerCase();
      const exact = headerLower.indexOf(pLow);
      if (exact !== -1) return exact;
      const partial = headerLower.findIndex((h) => h.includes(pLow));
      if (partial !== -1) return partial;
    }
    return -1;
  };

  const colTimeSec = findHeader('TimeInSeconds', 'Time (s)', 'ElapsedTime', 'Time');
  const colCpuUsage = findHeader('Total CPU Usage [%]', 'CPU Usage [%]', 'CPUUsagePct');
  const colCpuMaxThread = findHeader('Max CPU/Thread Usage [%]', 'CPU Max Thread [%]', 'CpuMaxThreadUsagePct');
  const colCpuNomClock = findHeader('Core Clocks (avg) [MHz]', 'CPU Clock [MHz]', 'CpuNominalClockMhz');
  const colCpuEffClock = findHeader('Core Effective Clocks (avg) [MHz]', 'CPU Effective Clock [MHz]', 'CpuEffectiveClockMhz');
  const colCpuTemp = findHeader('CPU Package [°C]', 'CPU Package [C]', 'CPU Temp [°C]', 'CpuTempC');
  const colCpuPower = findHeader('CPU Package Power [W]', 'Package Power [W]', 'CpuPackagePowerW');
  const colPl1 = findHeader('PL1 Power Limit [W]', 'CPU PL1 [W]', 'CpuPl1W');
  const colPl2 = findHeader('PL2 Power Limit [W]', 'CPU PL2 [W]', 'CpuPl2W');
  const colThermThrottle = findHeader('Thermal Throttling [Yes/No]', 'CPU Thermal Throttling', 'CpuThermalThrottling');
  const colPowerThrottle = findHeader('Power Limit Exceeded [Yes/No]', 'CPU Power Limit Throttling', 'CpuPowerLimitThrottling');
  const colProchot = findHeader('PROCHOT [Yes/No]', 'Ring/GT Critical Temp', 'CpuProchotActive');
  const colEpp = findHeader('Energy Performance Preference', 'EPP', 'CpuEppValue');

  const colGpuClock = findHeader('GPU Clock [MHz]', 'GPU GT Clock [MHz]', 'GpuClockMhz');
  const colGpuUsage = findHeader('GPU D3D Usage [%]', 'GPU GT Usage [%]', 'GPU Usage [%]', 'GpuUsagePct');
  const colGpu3d = findHeader('GPU 3D Usage [%]', 'GPU D3D 3D [%]', 'Gpu3dEnginePct');
  const colGpuCopy = findHeader('GPU Copy [%]', 'GpuCopyEnginePct');
  const colGpuVideo = findHeader('GPU Video Decode 0 [%]', 'GPU Video [%]', 'GpuVideoEnginePct');
  const colGpuPower = findHeader('GPU Power [W]', 'GPU GT Power [W]', 'GpuPowerW');
  const colGpuTemp = findHeader('GPU Temperature [°C]', 'GPU GT Temp [°C]', 'GpuTempC');
  const colGpuThermLim = findHeader('GPU Thermal Limit [Yes/No]', 'GpuThermalLimitActive');
  const colGpuPowerLim = findHeader('GPU Power Limit [Yes/No]', 'GpuPowerLimitActive');
  const colGpuSharedMem = findHeader('GPU D3D Memory Dynamic [MB]', 'GPU Shared Memory [MB]', 'GpuSharedMemoryUsedMb');

  const colRamUsed = findHeader('Physical Memory Used [MB]', 'RAM Used [MB]', 'RamUsedMb');
  const colRamLoad = findHeader('Physical Memory Load [%]', 'RAM Load [%]', 'RamLoadPct');
  const colPageFile = findHeader('Page File Usage [%]', 'Swap Usage [%]', 'PageFileUsagePct');
  const colMemClock = findHeader('Memory Clock [MHz]', 'DRAM Clock [MHz]', 'MemoryClockMhz');

  const missingExpectedSensors: string[] = [];
  if (colGpuClock === -1) missingExpectedSensors.push('Frequência da GPU (GPU Clock [MHz])');
  if (colGpuUsage === -1) missingExpectedSensors.push('Utilização da GPU (GPU D3D Usage [%])');
  if (colCpuEffClock === -1) missingExpectedSensors.push('Frequência Efetiva da CPU (Core Effective Clocks [MHz])');
  if (colCpuTemp === -1) missingExpectedSensors.push('Temperatura do Package da CPU (CPU Package [°C])');
  if (colCpuPower === -1) missingExpectedSensors.push('Potência do Package da CPU (CPU Package Power [W])');

  if (colGpuClock === -1 && colCpuTemp === -1 && colCpuUsage === -1) {
    warnings.push('Cabeçalho HWiNFO64 não contém colunas reconhecidas de sensores de hardware.');
    return {
      samples: [],
      detectedColumns: headers,
      missingExpectedSensors,
      warnings,
      malformedLinesCount: rawLines.length - 1,
      duplicateTimestampsRemoved: 0,
      outOfOrderCorrected: false,
    };
  }

  let malformedLinesCount = 0;
  const samples: HwinfoSensorRow[] = [];

  for (let i = 1; i < rawLines.length; i++) {
    const line = rawLines[i];
    // Skip repeated footer header lines that HWiNFO64 often writes at the end of CSV logs
    if (line.toLowerCase().includes('total cpu usage') || line.toLowerCase().includes('gpu clock')) {
      continue;
    }

    const cells = splitCsvLine(line, delimiter);
    if (cells.length < 3) {
      malformedLinesCount++;
      warnings.push(`Linha HWiNFO ${i + 1}: linha truncada ou malformada. Ignorada.`);
      continue;
    }

    let timeSec = colTimeSec !== -1 ? parseNullableNumber(cells[colTimeSec]) : null;
    if (timeSec === null) {
      // If Time column is HH:MM:SS.mmm string, parse relative seconds
      const rawTimeStr = colTimeSec !== -1 ? cells[colTimeSec] : '';
      const timeMatch = /^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(rawTimeStr);
      if (timeMatch) {
        const h = Number(timeMatch[1]);
        const m = Number(timeMatch[2]);
        const s = Number(timeMatch[3]);
        const ms = timeMatch[4] ? Number('0.' + timeMatch[4]) : 0;
        timeSec = h * 3600 + m * 60 + s + ms;
      }
    }

    if (timeSec === null || timeSec < 0) {
      malformedLinesCount++;
      warnings.push(`Linha HWiNFO ${i + 1}: timestamp inválido ou ausente. Ignorada.`);
      continue;
    }

    const isoTime = new Date(baseDateMs + Math.round(timeSec * 1000)).toISOString();

    samples.push({
      sampleIndex: samples.length,
      timeInSeconds: timeSec,
      timestampUtc: isoTime,
      cpuUsageTotalPct: colCpuUsage !== -1 ? parseNullableNumber(cells[colCpuUsage]) : null,
      cpuMaxThreadUsagePct: colCpuMaxThread !== -1 ? parseNullableNumber(cells[colCpuMaxThread]) : null,
      cpuCoreUsagePct: [],
      cpuNominalClockMhz: colCpuNomClock !== -1 ? parseNullableNumber(cells[colCpuNomClock]) : null,
      cpuEffectiveClockMhz: colCpuEffClock !== -1 ? parseNullableNumber(cells[colCpuEffClock]) : null,
      cpuTempC: colCpuTemp !== -1 ? parseNullableNumber(cells[colCpuTemp]) : null,
      cpuPackagePowerW: colCpuPower !== -1 ? parseNullableNumber(cells[colCpuPower]) : null,
      cpuPl1W: colPl1 !== -1 ? parseNullableNumber(cells[colPl1]) : null,
      cpuPl2W: colPl2 !== -1 ? parseNullableNumber(cells[colPl2]) : null,
      cpuThermalThrottling: colThermThrottle !== -1 ? parseNullableBoolean(cells[colThermThrottle]) : null,
      cpuPowerLimitThrottling: colPowerThrottle !== -1 ? parseNullableBoolean(cells[colPowerThrottle]) : null,
      cpuProchotActive: colProchot !== -1 ? parseNullableBoolean(cells[colProchot]) : null,
      cpuEppValue: colEpp !== -1 ? parseNullableNumber(cells[colEpp]) : null,
      gpuClockMhz: colGpuClock !== -1 ? parseNullableNumber(cells[colGpuClock]) : null,
      gpuUsagePct: colGpuUsage !== -1 ? parseNullableNumber(cells[colGpuUsage]) : null,
      gpu3dEnginePct: colGpu3d !== -1 ? parseNullableNumber(cells[colGpu3d]) : null,
      gpuCopyEnginePct: colGpuCopy !== -1 ? parseNullableNumber(cells[colGpuCopy]) : null,
      gpuVideoEnginePct: colGpuVideo !== -1 ? parseNullableNumber(cells[colGpuVideo]) : null,
      gpuPowerW: colGpuPower !== -1 ? parseNullableNumber(cells[colGpuPower]) : null,
      gpuTempC: colGpuTemp !== -1 ? parseNullableNumber(cells[colGpuTemp]) : null,
      gpuThermalLimitActive: colGpuThermLim !== -1 ? parseNullableBoolean(cells[colGpuThermLim]) : null,
      gpuPowerLimitActive: colGpuPowerLim !== -1 ? parseNullableBoolean(cells[colGpuPowerLim]) : null,
      gpuSharedMemoryUsedMb: colGpuSharedMem !== -1 ? parseNullableNumber(cells[colGpuSharedMem]) : null,
      ramUsedMb: colRamUsed !== -1 ? parseNullableNumber(cells[colRamUsed]) : null,
      ramLoadPct: colRamLoad !== -1 ? parseNullableNumber(cells[colRamLoad]) : null,
      pageFileUsagePct: colPageFile !== -1 ? parseNullableNumber(cells[colPageFile]) : null,
      memoryClockMhz: colMemClock !== -1 ? parseNullableNumber(cells[colMemClock]) : null,
      isSimulated,
      rawLineNumber: i + 1,
      parseWarnings: [],
    });
  }

  // Normalize relative start time if timestamps came from wall clock seconds
  if (samples.length > 0 && samples[0].timeInSeconds > 3600) {
    const t0 = samples[0].timeInSeconds;
    for (const s of samples) {
      s.timeInSeconds = Number((s.timeInSeconds - t0).toFixed(3));
    }
  }

  let outOfOrderCorrected = false;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].timeInSeconds < samples[i - 1].timeInSeconds) {
      outOfOrderCorrected = true;
      break;
    }
  }
  if (outOfOrderCorrected) {
    warnings.push('Amostras HWiNFO64 fora de ordem cronológica detectadas; ordenação temporal aplicada.');
    samples.sort((a, b) => a.timeInSeconds - b.timeInSeconds);
  }

  const deduped: HwinfoSensorRow[] = [];
  let duplicateTimestampsRemoved = 0;
  for (const s of samples) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(prev.timeInSeconds - s.timeInSeconds) < 1e-5) {
      duplicateTimestampsRemoved++;
      continue;
    }
    deduped.push({ ...s, sampleIndex: deduped.length });
  }

  return {
    samples: deduped,
    detectedColumns: headers,
    missingExpectedSensors,
    warnings,
    malformedLinesCount,
    duplicateTimestampsRemoved,
    outOfOrderCorrected,
  };
}
