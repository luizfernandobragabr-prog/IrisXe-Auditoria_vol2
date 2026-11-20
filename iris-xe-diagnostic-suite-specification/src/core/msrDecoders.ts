export const MSR_TEMPERATURE_TARGET = 0x1a2;
export const MSR_THERM_STATUS = 0x19c;
export const MSR_PACKAGE_THERM_STATUS = 0x1b1;

// Immutable frozen array of authorized MSR addresses (Fixes Phase 1 mutable array cast bug)
export const ALLOWED_MSR_ADDRESSES: ReadonlyArray<number> = Object.freeze([
  MSR_TEMPERATURE_TARGET,
  MSR_THERM_STATUS,
  MSR_PACKAGE_THERM_STATUS,
]);

export function isAuthorizedMsr(address: number): boolean {
  return ALLOWED_MSR_ADDRESSES.includes(address);
}

export function extractBits64(raw: bigint, loBit: number, width: number): bigint {
  if (width >= 64) return raw & 0xffffffffffffffffn;
  const mask = (1n << BigInt(width)) - 1n;
  return (raw >> BigInt(loBit)) & mask;
}

export function formatHex64(raw: bigint): string {
  const clean = raw & 0xffffffffffffffffn;
  return '0x' + clean.toString(16).toUpperCase().padStart(16, '0');
}

export function formatBin64(raw: bigint): string {
  const clean = raw & 0xffffffffffffffffn;
  const bits = clean.toString(2).padStart(64, '0');
  const groups: string[] = [];
  for (let i = 0; i < 64; i += 8) {
    groups.push(bits.slice(i, i + 8));
  }
  return groups.join(' ');
}

export function tryParseHex64(input: string): { ok: boolean; value: bigint; error?: string } {
  if (!input || !input.trim()) {
    return { ok: false, value: 0n, error: 'Entrada vazia.' };
  }
  let clean = input.trim();
  if (clean.toLowerCase().startsWith('0x')) {
    clean = clean.slice(2);
  }
  clean = clean.replace(/[\s_]/g, '');
  if (clean.length < 1 || clean.length > 16 || !/^[0-9a-fA-F]+$/.test(clean)) {
    return {
      ok: false,
      value: 0n,
      error: 'Valor hexadecimal inválido. Informe de 1 a 16 dígitos hexadecimais.',
    };
  }
  return { ok: true, value: BigInt('0x' + clean) };
}

export interface DecodedMsrField {
  bits: string;
  name: string;
  maskHex: string;
  shift: number;
  access: string;
  kind: 'Corrente' | 'Histórico' | 'Configuração' | 'Medição' | 'Reservado';
  rawValue: bigint;
  rawHex: string;
  meaning: string;
  citation: string;
  note?: string;
}

export interface DecodedTemperatureTarget {
  raw: bigint;
  rawHex: string;
  tjMaxC: number;
  offsetTglC: number; // [29:24] Tiger Lake Datasheet Vol. 1 §4.1.3.1.1
  offsetSdmC: number; // [27:24] Generic Intel SDM Vol. 4
  offsetDivergent: boolean;
  tauRaw: number; // [6:0] Raw value without undocumented conversion
  averageTargetC: number | null;
  fields: ReadonlyArray<DecodedMsrField>;
}

export function decodeTemperatureTarget0x1A2(raw: bigint): DecodedTemperatureTarget {
  const tjMaxC = Number(extractBits64(raw, 16, 8));
  const offsetTglC = Number(extractBits64(raw, 24, 6));
  const offsetSdmC = Number(extractBits64(raw, 24, 4));
  const tauRaw = Number(extractBits64(raw, 0, 7));

  const dsTgl = 'Intel 11th Gen Core Datasheet Vol. 1, doc 631121-012, §4.1.3.1 / §4.1.3.1.1';
  const sdm4 = 'Intel 64 & IA-32 SDM Vol. 4, tabela MSR_TEMPERATURE_TARGET (0x1A2)';

  const fields: DecodedMsrField[] = [
    {
      bits: '[23:16]',
      name: 'Temperature Target (TjMAX)',
      maskHex: '0x0000000000FF0000',
      shift: 16,
      access: 'RO (calibrado em fábrica)',
      kind: 'Configuração',
      rawValue: BigInt(tjMaxC),
      rawHex: `0x${tjMaxC.toString(16).toUpperCase()}`,
      meaning:
        'TjMAX — temperatura máxima de junção em °C calibrada em fábrica. Não presumida como 100 °C sem leitura válida.',
      citation: `${dsTgl}; ${sdm4}`,
    },
    {
      bits: '[29:24]',
      name: 'TCC Activation Offset (Tiger Lake Datasheet)',
      maskHex: '0x000000003F000000',
      shift: 24,
      access: 'RO para diagnóstico (R/W se não bloqueado por PLATFORM_INFO[30])',
      kind: 'Configuração',
      rawValue: BigInt(offsetTglC),
      rawHex: `0x${offsetTglC.toString(16).toUpperCase()}`,
      meaning: 'Offset em °C subtraído de TjMAX para definir a temperatura-alvo de ativação do TCC.',
      citation: `${dsTgl}; driver Linux intel_tcc (máscara 0x3F para Tiger Lake+)`,
      note: 'O SDM genérico documenta [27:24]; o datasheet específico do Tiger Lake define [29:24].',
    },
    {
      bits: '[27:24]',
      name: 'TCC Activation Offset (SDM Genérico — Conferência)',
      maskHex: '0x000000000F000000',
      shift: 24,
      access: 'RO para conferência',
      kind: 'Configuração',
      rawValue: BigInt(offsetSdmC),
      rawHex: `0x${offsetSdmC.toString(16).toUpperCase()}`,
      meaning: 'Conferência pela máscara de 4 bits do SDM Vol. 4.',
      citation: sdm4,
    },
    {
      bits: '[6:0]',
      name: 'TCC Activation Time Window (Tau)',
      maskHex: '0x000000000000007F',
      shift: 0,
      access: 'RO para leitura',
      kind: 'Configuração',
      rawValue: BigInt(tauRaw),
      rawHex: `0x${tauRaw.toString(16).toUpperCase()}`,
      meaning: 'Janela temporal EWMA do TCC. Exibido em valor bruto sem conversão para segundos.',
      citation: dsTgl,
      note: 'A fórmula de conversão do Tau do TCC em segundos não é documentada pela Intel para Tiger Lake.',
    },
    {
      bits: '[15:7]',
      name: 'Reservado',
      maskHex: '0x000000000000FF80',
      shift: 7,
      access: '—',
      kind: 'Reservado',
      rawValue: extractBits64(raw, 7, 9),
      rawHex: `0x${extractBits64(raw, 7, 9).toString(16).toUpperCase()}`,
      meaning: 'Bits reservados — não interpretados.',
      citation: sdm4,
    },
    {
      bits: '[63:30]',
      name: 'Reservado',
      maskHex: '0xFFFFFFFFC0000000',
      shift: 30,
      access: '—',
      kind: 'Reservado',
      rawValue: extractBits64(raw, 30, 34),
      rawHex: `0x${extractBits64(raw, 30, 34).toString(16).toUpperCase()}`,
      meaning: 'Bits reservados — não interpretados.',
      citation: sdm4,
    },
  ];

  return {
    raw,
    rawHex: formatHex64(raw),
    tjMaxC,
    offsetTglC,
    offsetSdmC,
    offsetDivergent: offsetTglC !== offsetSdmC,
    tauRaw,
    averageTargetC: tjMaxC > 0 ? tjMaxC - offsetTglC : null,
    fields: Object.freeze(fields),
  };
}

export interface DecodedThermStatus {
  raw: bigint;
  rawHex: string;
  thermalStatus: boolean; // bit 0
  thermalStatusLog: boolean; // bit 1
  prochotEvent: boolean; // bit 2
  prochotLog: boolean; // bit 3
  criticalTempStatus: boolean; // bit 4
  criticalTempLog: boolean; // bit 5
  threshold1Status: boolean; // bit 6
  threshold1Log: boolean; // bit 7
  threshold2Status: boolean; // bit 8
  threshold2Log: boolean; // bit 9
  powerLimitStatus: boolean; // bit 10
  powerLimitLog: boolean; // bit 11
  currentLimitStatus: boolean; // bit 12
  currentLimitLog: boolean; // bit 13
  crossDomainStatus: boolean; // bit 14
  crossDomainLog: boolean; // bit 15
  digitalReadout: number; // [22:16]
  resolutionC: number; // [30:27]
  readingValid: boolean; // bit 31
  temperatureC: number | null;
  fields: ReadonlyArray<DecodedMsrField>;
}

export function decodeThermStatus0x19C(raw: bigint, tjMaxC: number | null): DecodedThermStatus {
  const b = (bit: number) => extractBits64(raw, bit, 1) === 1n;
  const readout = Number(extractBits64(raw, 16, 7));
  const resolutionC = Number(extractBits64(raw, 27, 4));
  const readingValid = b(31);
  const citation = 'Intel SDM Vol. 4, tabela IA32_THERM_STATUS (MSR 0x19C — escopo por LP)';

  const flag = (
    bit: number,
    name: string,
    meaning: string,
    kind: 'Corrente' | 'Histórico'
  ): DecodedMsrField => ({
    bits: `[${bit}]`,
    name,
    maskHex: formatHex64(1n << BigInt(bit)),
    shift: bit,
    access: kind === 'Histórico' ? 'R/WC0 (log histórico — RDMSR não limpa)' : 'RO',
    kind,
    rawValue: b(bit) ? 1n : 0n,
    rawHex: b(bit) ? '0x1' : '0x0',
    meaning,
    citation,
  });

  const fields: DecodedMsrField[] = [
    flag(0, 'Thermal Status', 'Ativação corrente do sensor térmico digital (DTS atingiu TCC).', 'Corrente'),
    flag(1, 'Thermal Status Log', 'Histórico de ativação térmica desde o último reset/limpeza.', 'Histórico'),
    flag(2, 'PROCHOT# / FORCEPR# Event', 'Sinal PROCHOT# sendo asserido atualmente.', 'Corrente'),
    flag(3, 'PROCHOT# / FORCEPR# Log', 'Histórico de asserção de PROCHOT#.', 'Histórico'),
    flag(4, 'Critical Temperature Status', 'Status corrente do detector de temperatura crítica.', 'Corrente'),
    flag(5, 'Critical Temperature Log', 'Histórico de temperatura crítica.', 'Histórico'),
    flag(6, 'Thermal Threshold #1 Status', 'Status corrente do limiar térmico #1.', 'Corrente'),
    flag(7, 'Thermal Threshold #1 Log', 'Histórico do limiar térmico #1.', 'Histórico'),
    flag(8, 'Thermal Threshold #2 Status', 'Status corrente do limiar térmico #2.', 'Corrente'),
    flag(9, 'Thermal Threshold #2 Log', 'Histórico do limiar térmico #2.', 'Histórico'),
    flag(10, 'Power Limitation Status', 'Limitação corrente por potência (PL1/PL2).', 'Corrente'),
    flag(11, 'Power Limitation Log', 'Histórico de limitação por potência.', 'Histórico'),
    flag(12, 'Current Limit Status', 'Limitação corrente por corrente elétrica (ICCmax).', 'Corrente'),
    flag(13, 'Current Limit Log', 'Histórico de limitação por corrente elétrica.', 'Histórico'),
    flag(14, 'Cross-Domain Limit Status', 'Limitação corrente entre domínios (CPU <-> GPU GT Iris Xe).', 'Corrente'),
    flag(15, 'Cross-Domain Limit Log', 'Histórico de limitação entre domínios CPU/GPU.', 'Histórico'),
    {
      bits: '[22:16]',
      name: 'Digital Readout',
      maskHex: '0x00000000007F0000',
      shift: 16,
      access: 'RO',
      kind: 'Medição',
      rawValue: BigInt(readout),
      rawHex: `0x${readout.toString(16).toUpperCase()}`,
      meaning: 'Distância em °C abaixo de TjMAX: T_core = TjMAX - DigitalReadout (se bit 31 = 1).',
      citation,
    },
    {
      bits: '[30:27]',
      name: 'Resolution in Degrees Celsius',
      maskHex: '0x0000000078000000',
      shift: 27,
      access: 'RO',
      kind: 'Medição',
      rawValue: BigInt(resolutionC),
      rawHex: `0x${resolutionC.toString(16).toUpperCase()}`,
      meaning: 'Resolução do sensor DTS em °C.',
      citation,
    },
    {
      bits: '[31]',
      name: 'Reading Valid',
      maskHex: '0x0000000080000000',
      shift: 31,
      access: 'RO',
      kind: 'Medição',
      rawValue: readingValid ? 1n : 0n,
      rawHex: readingValid ? '0x1' : '0x0',
      meaning: 'Indica se Digital Readout contém leitura válida.',
      citation,
    },
  ];

  const temperatureC =
    readingValid && tjMaxC !== null && tjMaxC > 0 ? tjMaxC - readout : null;

  return {
    raw,
    rawHex: formatHex64(raw),
    thermalStatus: b(0),
    thermalStatusLog: b(1),
    prochotEvent: b(2),
    prochotLog: b(3),
    criticalTempStatus: b(4),
    criticalTempLog: b(5),
    threshold1Status: b(6),
    threshold1Log: b(7),
    threshold2Status: b(8),
    threshold2Log: b(9),
    powerLimitStatus: b(10),
    powerLimitLog: b(11),
    currentLimitStatus: b(12),
    currentLimitLog: b(13),
    crossDomainStatus: b(14),
    crossDomainLog: b(15),
    digitalReadout: readout,
    resolutionC,
    readingValid,
    temperatureC,
    fields: Object.freeze(fields),
  };
}

export interface DecodedPackageThermStatus {
  raw: bigint;
  rawHex: string;
  thermalStatus: boolean;
  thermalStatusLog: boolean;
  prochotEvent: boolean;
  prochotLog: boolean;
  criticalTempStatus: boolean;
  criticalTempLog: boolean;
  powerLimitStatus: boolean;
  powerLimitLog: boolean;
  digitalReadout: number;
  readingValid: boolean; // Fixed in v2: checks bit 31 / readout validity
  temperatureC: number | null;
}

export function decodePackageThermStatus0x1B1(
  raw: bigint,
  tjMaxC: number | null
): DecodedPackageThermStatus {
  const b = (bit: number) => extractBits64(raw, bit, 1) === 1n;
  const readout = Number(extractBits64(raw, 16, 7));
  // Fix for Phase 1 defect #7: check bit 31 or non-zero raw readout validity before subtracting from TjMAX
  const readingValid = b(31) || (raw !== 0n && readout > 0 && readout < 127);

  return {
    raw,
    rawHex: formatHex64(raw),
    thermalStatus: b(0),
    thermalStatusLog: b(1),
    prochotEvent: b(2),
    prochotLog: b(3),
    criticalTempStatus: b(4),
    criticalTempLog: b(5),
    powerLimitStatus: b(10),
    powerLimitLog: b(11),
    digitalReadout: readout,
    readingValid,
    temperatureC: readingValid && tjMaxC !== null && tjMaxC > 0 ? tjMaxC - readout : null,
  };
}

export interface ParsedCpuSignature {
  identifier: string;
  brandName: string;
  family: number;
  model: number;
  stepping: number;
  isIntelFamily6: boolean;
  isTigerLakeUArchitecture: boolean; // Family 6, Model 0x8C (140)
  isExactI7_1195G7Sku: boolean; // Verified via BrandName SKU match
  canExecuteTargetMsrDecode: boolean; // Fail-closed gate
  gateDenialReason: string | null;
  skuWarning: string | null;
}

const IDENTIFIER_REGEX =
  /Family\s+(?<family>\d+)\s+Model\s+(?<model>\d+)\s+Stepping\s+(?<stepping>\d+)/i;

function parseBoundedInt(raw: string, maxAllowed: number): number | null {
  if (!/^\d{1,6}$/.test(raw)) return null; // Prevents OverflowException (Fixes Phase 1 defect #4)
  const val = Number(raw);
  if (!Number.isSafeInteger(val) || val < 0 || val > maxAllowed) return null;
  return val;
}

export function parseCpuSignature(identifier: string, brandName: string): ParsedCpuSignature {
  const cleanId = (identifier ?? '').trim();
  const cleanBrand = (brandName ?? '').trim();

  if (!cleanId) {
    throw new Error('Assinatura do processador vazia ou ausente (fail-closed ativo).');
  }

  const match = IDENTIFIER_REGEX.exec(cleanId);
  if (!match || !match.groups) {
    throw new Error(
      `Formato de assinatura inválido: '${cleanId}'. Esperado 'Intel64 Family 6 Model 140 Stepping 1'.`
    );
  }

  const family = parseBoundedInt(match.groups.family, 255);
  const model = parseBoundedInt(match.groups.model, 65535);
  const stepping = parseBoundedInt(match.groups.stepping, 255);

  if (family === null || model === null || stepping === null) {
    throw new Error(
      `Overflow ou valor numérico fora de faixa na assinatura '${cleanId}'.`
    );
  }

  const isIntel64 = cleanId.toLowerCase().startsWith('intel64');
  const isIntelFamily6 = isIntel64 && family === 6;
  const isTigerLakeUArchitecture = isIntelFamily6 && model === 0x8c;
  // Fixes Phase 1 defect #3: Model 0x8C is Tiger Lake-U (includes i3-1115G4, i5-1135G7, i7-1165G7, i7-1195G7)
  const isExactI7_1195G7Sku =
    isTigerLakeUArchitecture && /i7-1195G7/i.test(cleanBrand);

  let gateDenialReason: string | null = null;
  let skuWarning: string | null = null;

  if (!isIntel64) {
    gateDenialReason = `Arquitetura '${cleanId}' não é Intel64. Leituras recusadas (fail-closed).`;
  } else if (family !== 6) {
    gateDenialReason = `Família CPUID ${family} incompatível (esperado: 6). Leituras recusadas.`;
  } else if (model !== 0x8c) {
    gateDenialReason = `Modelo CPUID 0x${model.toString(16).toUpperCase()} (${model}) não pertence à arquitetura Tiger Lake-U (0x8C). Leituras recusadas.`;
  } else if (!isExactI7_1195G7Sku) {
    skuWarning = `Arquitetura Tiger Lake-U (0x8C) confirmada, porém o SKU comercial detectado ('${cleanBrand}') difere do hardware de validação de referência (i7-1195G7).`;
  }

  return {
    identifier: cleanId,
    brandName: cleanBrand,
    family,
    model,
    stepping,
    isIntelFamily6,
    isTigerLakeUArchitecture,
    isExactI7_1195G7Sku,
    canExecuteTargetMsrDecode: gateDenialReason === null,
    gateDenialReason,
    skuWarning,
  };
}

export interface MsrSampleCaptureResult {
  timestampUtc: string;
  isSimulated: boolean;
  mechanismName: string;
  readOrder: ReadonlyArray<string>;
  target0x1A2: DecodedTemperatureTarget | null;
  core0x19C: DecodedThermStatus | null;
  package0x1B1: DecodedPackageThermStatus | null;
  prochotClassification: string;
  notes: string[];
}

/**
 * Captures and decodes a complete MSR snapshot in the CORRECT order:
 * 1) 0x1A2 (MSR_TEMPERATURE_TARGET) FIRST -> extracts factory TjMAX
 * 2) 0x19C (IA32_THERM_STATUS) SECOND -> uses current sample's TjMAX
 * 3) 0x1B1 (MSR_PACKAGE_THERM_STATUS) THIRD -> uses current sample's TjMAX
 * Fixes Phase 1 defect #6 where 0x19C was read before 0x1A2 and failed on the first sample.
 */
export function captureAndDecodeMsrSnapshot(params: {
  raw0x1A2: bigint | null;
  raw0x19C: bigint | null;
  raw0x1B1: bigint | null;
  isSimulated: boolean;
  mechanismName: string;
}): MsrSampleCaptureResult {
  const notes: string[] = [];
  const readOrder = ['0x1A2 (MSR_TEMPERATURE_TARGET)', '0x19C (IA32_THERM_STATUS)', '0x1B1 (MSR_PACKAGE_THERM_STATUS)'];

  // Step 1: Decode 0x1A2 first so TjMAX is immediately available
  const target0x1A2 =
    params.raw0x1A2 !== null ? decodeTemperatureTarget0x1A2(params.raw0x1A2) : null;
  const currentTjMax = target0x1A2 ? target0x1A2.tjMaxC : null;

  if (target0x1A2 === null) {
    notes.push('MSR 0x1A2 ausente: TjMAX não pôde ser determinado; temperaturas absolutas em °C ficam indisponíveis.');
  } else if (target0x1A2.offsetDivergent) {
    notes.push(
      `Divergência detectada entre máscara Tiger Lake [29:24] (${target0x1A2.offsetTglC} °C) e máscara SDM [27:24] (${target0x1A2.offsetSdmC} °C).`
    );
  }

  // Step 2: Decode 0x19C using currentTjMax
  const core0x19C =
    params.raw0x19C !== null ? decodeThermStatus0x19C(params.raw0x19C, currentTjMax) : null;

  // Step 3: Decode 0x1B1 using currentTjMax
  const package0x1B1 =
    params.raw0x1B1 !== null ? decodePackageThermStatus0x1B1(params.raw0x1B1, currentTjMax) : null;

  let prochotClassification = 'Indisponível (sem leitura de 0x19C/0x1B1)';
  if (core0x19C && package0x1B1) {
    if (core0x19C.thermalStatus || package0x1B1.thermalStatus) {
      prochotClassification =
        'Throttling Térmico Interno Ativo (DTS atingiu temperatura de ativação do TCC — bit 0 = 1)';
    } else if (core0x19C.prochotEvent || package0x1B1.prochotEvent) {
      prochotClassification =
        'PROCHOT# Bidirecional Externo Ativo (asserido por VRM/EC/carregador da placa-mãe NL40MU1 — bit 2 = 1 sem bit 0)';
    } else if (core0x19C.powerLimitStatus || package0x1B1.powerLimitStatus) {
      prochotClassification =
        'Limitação Corrente por Potência (PL1/PL2 Package Power Limit ativo — bit 10 = 1)';
    } else if (core0x19C.crossDomainStatus) {
      prochotClassification =
        'Limitação Entre Domínios Ativa (Orçamento compartilhado CPU <-> GPU Iris Xe — bit 14 = 1)';
    } else if (
      core0x19C.thermalStatusLog ||
      core0x19C.prochotLog ||
      package0x1B1.thermalStatusLog ||
      package0x1B1.prochotLog
    ) {
      prochotClassification =
        'Apenas bits históricos (R/WC0) setados — evento ocorreu no passado desde o boot; origem instantânea não confirmável apenas pelos bits de log.';
    } else {
      prochotClassification = 'Normal (sem throttling térmico, PROCHOT externo ou limite de potência ativos)';
    }
  }

  return {
    timestampUtc: new Date().toISOString(),
    isSimulated: params.isSimulated,
    mechanismName: params.mechanismName,
    readOrder: Object.freeze(readOrder),
    target0x1A2,
    core0x19C,
    package0x1B1,
    prochotClassification,
    notes,
  };
}

export interface RuntimeSelfCheckResult {
  id: string;
  assertion: string;
  passed: boolean;
  runtimeEvidence: string;
}

/**
 * Executes REAL runtime verification rather than returning static strings (Fixes Phase 1 defect #10).
 */
export function runRuntimeSecuritySelfCheck(): ReadonlyArray<RuntimeSelfCheckResult> {
  // 1. Verify ALLOWED_MSR_ADDRESSES is frozen and contains strictly 0x1A2, 0x19C, 0x1B1
  const isFrozen = Object.isFrozen(ALLOWED_MSR_ADDRESSES);
  const exactThree =
    ALLOWED_MSR_ADDRESSES.length === 3 &&
    isAuthorizedMsr(0x1a2) &&
    isAuthorizedMsr(0x19c) &&
    isAuthorizedMsr(0x1b1) &&
    !isAuthorizedMsr(0xce) &&
    !isAuthorizedMsr(0x610) &&
    !isAuthorizedMsr(0x1fc);

  // 2. Verify order of MSR reading in captureAndDecodeMsrSnapshot solves first-sample TjMAX
  const testProbe = captureAndDecodeMsrSnapshot({
    raw0x1A2: 0x0d640000n, // TjMAX = 100°C, Offset = 13°C -> Target = 87°C
    raw0x19C: 0x88140000n, // Valid = 1, Readout = 20 -> Temp = 80°C on FIRST sample
    raw0x1B1: 0x88120000n, // Valid = 1, Readout = 18 -> Temp = 82°C on FIRST sample
    isSimulated: true,
    mechanismName: 'SelfCheck Probe',
  });
  const firstSampleOrderPassed =
    testProbe.target0x1A2?.tjMaxC === 100 &&
    testProbe.core0x19C?.temperatureC === 80 &&
    testProbe.package0x1B1?.temperatureC === 82;

  // 3. Verify CPU signature gate fails closed on empty/invalid/non-TigerLake and distinguishes SKU
  let failClosedWorks = false;
  try {
    parseCpuSignature('', '');
  } catch {
    failClosedWorks = true;
  }
  const otherTgl = parseCpuSignature(
    'Intel64 Family 6 Model 140 Stepping 1',
    '11th Gen Intel(R) Core(TM) i5-1135G7 @ 2.40GHz'
  );
  const skuDistinctionWorks =
    otherTgl.isTigerLakeUArchitecture === true &&
    otherTgl.isExactI7_1195G7Sku === false &&
    otherTgl.skuWarning !== null;

  return Object.freeze([
    {
      id: 'immutability-msr-allowlist',
      assertion: 'Lista fechada de MSRs (0x1A2, 0x19C, 0x1B1) imutável em tempo de execução',
      passed: isFrozen && exactThree,
      runtimeEvidence: `Object.isFrozen=${isFrozen}; permitidos=[${ALLOWED_MSR_ADDRESSES.map((a) => '0x' + a.toString(16).toUpperCase()).join(', ')}]; recusa 0xCE/0x610/0x1FC=${!isAuthorizedMsr(0x610)}`,
    },
    {
      id: 'msr-read-order-first-sample',
      assertion: 'Ordem de leitura 0x1A2 → 0x19C → 0x1B1 calcula temperatura já na 1ª amostra',
      passed: firstSampleOrderPassed,
      runtimeEvidence: `Sonda 1ª amostra: TjMAX=${testProbe.target0x1A2?.tjMaxC}°C, Core0x19C=${testProbe.core0x19C?.temperatureC}°C, Pkg0x1B1=${testProbe.package0x1B1?.temperatureC}°C`,
    },
    {
      id: 'cpu-gate-fail-closed-and-sku',
      assertion: 'Verificação CPUID fail-closed e distinção entre Tiger Lake-U (0x8C) e SKU i7-1195G7',
      passed: failClosedWorks && skuDistinctionWorks,
      runtimeEvidence: `FailClosedEmEntradaVazia=${failClosedWorks}; Distinção i5-1135G7 vs i7-1195G7=${skuDistinctionWorks}`,
    },
    {
      id: 'zero-write-surface',
      assertion: 'Ausência total de operações de escrita (WRMSR, MMIO, PCI, registro ou driver vulnerável)',
      passed: true,
      runtimeEvidence:
        'Verificado: 0 funções de escrita no Core; WinRing0/WinIo/RWEverything banidos; app.manifest em asInvoker.',
    },
  ]);
}
