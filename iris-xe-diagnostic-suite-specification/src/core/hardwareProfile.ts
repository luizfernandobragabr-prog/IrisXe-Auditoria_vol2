export interface HardwareComponentComparison {
  id: string;
  componentName: string;
  expectedTargetSpec: string;
  detectedLiveEnvironment: string;
  detectedInActiveSessionLog: string;
  sourceOfDetection: string;
  status: 'match' | 'divergent-environment' | 'unverifiable-in-sandbox' | 'attention';
  technicalNote: string;
}

export interface LiveEnvironmentProbe {
  probedAtUtc: string;
  userAgent: string;
  platform: string;
  logicalProcessors: number | null;
  approxDeviceMemoryGb: number | null;
  webglVendor: string | null;
  webglRenderer: string | null;
  screenResolution: string;
  devicePixelRatio: number;
}

export function probeCurrentEnvironmentHardware(): LiveEnvironmentProbe {
  const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';
  if (!isBrowser) {
    return {
      probedAtUtc: new Date().toISOString(),
      userAgent: 'Node.js / Vitest Automated Test Runner',
      platform: typeof process !== 'undefined' ? `${process.platform} (${process.arch})` : 'CLI',
      logicalProcessors: null,
      approxDeviceMemoryGb: null,
      webglVendor: null,
      webglRenderer: null,
      screenResolution: 'N/A (Headless CLI)',
      devicePixelRatio: 1,
    };
  }

  let webglVendor: string | null = null;
  let webglRenderer: string | null = null;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        webglVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || null;
        webglRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || null;
      } else {
        webglVendor = gl.getParameter(gl.VENDOR) || null;
        webglRenderer = gl.getParameter(gl.RENDERER) || null;
      }
    }
  } catch {
    webglVendor = null;
    webglRenderer = null;
  }

  const navAny = navigator as unknown as { deviceMemory?: number };

  return {
    probedAtUtc: new Date().toISOString(),
    userAgent: navigator.userAgent || 'Desconhecido',
    platform: navigator.platform || 'Desconhecido',
    logicalProcessors:
      typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
    approxDeviceMemoryGb:
      typeof navAny.deviceMemory === 'number' ? navAny.deviceMemory : null,
    webglVendor,
    webglRenderer,
    screenResolution:
      typeof window.screen !== 'undefined'
        ? `${window.screen.width} × ${window.screen.height}`
        : 'Desconhecida',
    devicePixelRatio: typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1,
  };
}

export function buildHardwareComparisonTable(
  probe: LiveEnvironmentProbe,
  sessionHardwareOverrides?: Partial<Record<string, string>>
): HardwareComponentComparison[] {
  const isTargetCpuOnLive =
    probe.webglRenderer?.toLowerCase().includes('iris(r) xe') ||
    probe.webglRenderer?.toLowerCase().includes('iris xe') ||
    false;

  const lpMatch = probe.logicalProcessors === 8;
  const resMatch = probe.screenResolution === '1920 × 1080';
  const osWindows = probe.userAgent.toLowerCase().includes('windows');

  return [
    {
      id: 'hw-notebook-mobo',
      componentName: 'Notebook / Placa-mãe',
      expectedTargetSpec: 'Positivo Master 4250 · Placa-mãe NL40MU1',
      detectedLiveEnvironment:
        sessionHardwareOverrides?.mobo ??
        'Não exposto via API Web (requer SMBIOS / WMI Win32_BaseBoard ou HWiNFO Report)',
      detectedInActiveSessionLog: 'Positivo Master 4250 (NL40MU1 — SMBIOS/HWiNFO)',
      sourceOfDetection: 'SMBIOS / WMI (Desktop) · Cabeçalho HWiNFO64',
      status: 'unverifiable-in-sandbox',
      technicalNote:
        'A placa-mãe NL40MU1 define os limites de potência dinâmicos do EC (PL1/PL2) e a curva do cooler compartilhado.',
    },
    {
      id: 'hw-cpu-model',
      componentName: 'Processador & Arquitetura',
      expectedTargetSpec: 'Intel Core i7-1195G7 (Tiger Lake-U · CPUID Family 6 Model 0x8C)',
      detectedLiveEnvironment:
        sessionHardwareOverrides?.cpu ??
        (isTargetCpuOnLive
          ? 'Intel Tiger Lake / Iris Xe detectado via WebGL'
          : `Ambiente de visualização atual (${probe.platform} — assinatura CPUID real exige registro Windows ou log HWiNFO)`),
      detectedInActiveSessionLog: '11th Gen Intel(R) Core(TM) i7-1195G7 @ 2.90GHz (Família 6, Modelo 0x8C, Stepping 1)',
      sourceOfDetection: 'HKLM\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0 · HWiNFO64',
      status: isTargetCpuOnLive ? 'match' : 'divergent-environment',
      technicalNote:
        'O i7-1195G7 compartilha o package energético e térmico entre os 4 núcleos Willow Cove e a GPU Iris Xe.',
    },
    {
      id: 'hw-cpu-topology',
      componentName: 'Topologia de CPU',
      expectedTargetSpec: '4 núcleos físicos / 8 threads (processadores lógicos)',
      detectedLiveEnvironment:
        probe.logicalProcessors !== null
          ? `${probe.logicalProcessors} threads lógicas detectadas (navigator.hardwareConcurrency)`
          : 'Não disponível',
      detectedInActiveSessionLog: '4 núcleos físicos / 8 threads (Grupo 0, LP 0..7)',
      sourceOfDetection: 'navigator.hardwareConcurrency / WMI Win32_Processor',
      status: lpMatch ? 'match' : 'divergent-environment',
      technicalNote: lpMatch
        ? 'Contagem de threads lógicas coincide com os 8 LPs esperados do i7-1195G7.'
        : `DIVERGÊNCIA DETECTADA: O ambiente onde esta interface está aberta reportou ${probe.logicalProcessors ?? 'N/D'} threads lógicas (esperado no notebook alvo: 8 threads).`,
    },
    {
      id: 'hw-gpu',
      componentName: 'GPU Integrada & Unidades de Execução',
      expectedTargetSpec: 'Intel Iris Xe integrada · 96 EUs · Até 1,40 GHz (limite máximo anunciado)',
      detectedLiveEnvironment:
        probe.webglRenderer
          ? `${probe.webglRenderer} (${probe.webglVendor ?? 'WebGL'})`
          : 'Renderizador WebGL não identificado',
      detectedInActiveSessionLog: 'Intel(R) Iris(R) Xe Graphics (96 EUs · Clock medido: 750–1350 MHz)',
      sourceOfDetection: 'DXGI / WebGL UNMASKED_RENDERER / HWiNFO64',
      status: isTargetCpuOnLive ? 'match' : 'divergent-environment',
      technicalNote:
        'IMPORTANTE: 1,40 GHz é o limite gráfico anunciado de fábrica, NÃO uma frequência garantida em carga combinada CPU+GPU. Sob limite de potência PL1 (15W) ou temperatura ~100 °C, o clock real opera muito abaixo de 1,40 GHz.',
    },
    {
      id: 'hw-memory',
      componentName: 'Memória RAM (Capacidade, Canais e Clock)',
      expectedTargetSpec: '32 GB DDR4 · Dual-Channel · Frequência atual: 2133 MHz',
      detectedLiveEnvironment:
        probe.approxDeviceMemoryGb !== null
          ? `≥ ${probe.approxDeviceMemoryGb} GB reportados pelo navegador (limite de privacidade Web API = 8 GB); clock DDR4 requer HWiNFO`
          : 'Clock e canais de memória requerem leitura SMBIOS/HWiNFO64',
      detectedInActiveSessionLog: '32768 MB DDR4 Dual-Channel @ 2133 MT/s (1066,7 MHz DRAM Clock · 34,1 GB/s)',
      sourceOfDetection: 'HWiNFO64 / WMI Win32_PhysicalMemory',
      status: 'attention',
      technicalNote:
        'PONTO CRÍTICO DE ARQUITETURA: Embora 32 GB em Dual-Channel ofereçam ampla capacidade, a frequência de 2133 MHz limita a largura de banda teórica a 34,1 GB/s (contra 51,2 GB/s em DDR4-3200). Como a Iris Xe de 96 EUs não possui VRAM dedicada, ela disputa esses 34,1 GB/s diretamente com os 4 núcleos da CPU.',
    },
    {
      id: 'hw-storage',
      componentName: 'Armazenamento',
      expectedTargetSpec: 'SSD NVMe de 512 GB',
      detectedLiveEnvironment: 'Não acessível via navegador sem seleção de arquivo',
      detectedInActiveSessionLog: 'NVMe SSD 512 GB (PCIe Gen3 x4)',
      sourceOfDetection: 'WMI Win32_DiskDrive / HWiNFO64',
      status: 'unverifiable-in-sandbox',
      technicalNote: 'Baixa probabilidade de ser a causa primária de tearing, mas relevante se houver paginação ou compilação de shader cache.',
    },
    {
      id: 'hw-os',
      componentName: 'Sistema Operacional',
      expectedTargetSpec: 'Windows 11 Pro 64 bits, versão 25H2',
      detectedLiveEnvironment: `${probe.userAgent}`,
      detectedInActiveSessionLog: 'Windows 11 Pro x64 · Versão 25H2 (Build 26200)',
      sourceOfDetection: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion · User-Agent',
      status: osWindows ? 'match' : 'divergent-environment',
      technicalNote:
        'O Windows 11 25H2 possui suporte a Otimizações para Jogos em Janela (Auto DirectFlip) e DRR, cujo comportamento pode mudar após atualizações cumulativas.',
    },
    {
      id: 'hw-monitor',
      componentName: 'Monitor Externo, Resolução, Refresh e Conexão',
      expectedTargetSpec: 'Weal LCD 22,5" · 1920 × 1080 · 100 Hz · Conexão HDMI',
      detectedLiveEnvironment: `Resolução da tela atual: ${probe.screenResolution} (DPR ${probe.devicePixelRatio}x)`,
      detectedInActiveSessionLog: 'Weal LCD 22,5" · 1920 × 1080 @ 100,0 Hz (Período de Scanout = 10,00 ms via HDMI)',
      sourceOfDetection: 'DisplayConfig / EDID / window.screen / PresentMon MsBetweenDisplayChange',
      status: resMatch ? 'match' : 'divergent-environment',
      technicalNote:
        'A frequência de 100 Hz equivale a um ciclo de varredura vertical de 10,00 ms. Não presuma que o monitor Weal suporte FreeSync/VRR funcional via HDMI sem comprovação nas 3 camadas da aba VRR.',
    },
  ];
}
