export interface Phase1AuditDefect {
  id: string;
  title: string;
  severity: 'Crítica' | 'Alta' | 'Média' | 'Arquitetural';
  fileAndLines: string;
  verifiedPresentInCommit: boolean;
  technicalFinding: string;
  securityOrDiagnosticImpact: string;
  v2Resolution: string;
  reusableFromPhase1: string;
}

export const PHASE1_REPO_METADATA = Object.freeze({
  repositoryUrl: 'https://github.com/luizfernandobragabr-prog/IrisXe-Auditoria',
  originalBranch: 'main',
  referenceCommit: '8501a29a392884e9585fa665797e407797e48bc5',
  newDevelopmentBranch: 'diagnostico-irisxe-v2',
  totalFilesInspected: 34,
  projectsInspected: [
    'IrisXe.Thermal.Core (18 arquivos C#)',
    'IrisXe.Thermal.Core.Tests (4 arquivos xUnit)',
    'IrisXe.Thermal.App (5 arquivos WinForms + app.manifest)',
  ],
});

export const PHASE1_AUDITED_DEFECTS: ReadonlyArray<Phase1AuditDefect> = Object.freeze([
  {
    id: 'AUD-01',
    title: 'Acesso concorrente a controles WinForms a partir de thread de background (Cross-Thread UI Mutation)',
    severity: 'Crítica',
    fileAndLines: 'desktop/src/IrisXe.Thermal.App/MainForm.cs (linhas 107, 150–264, 893–896)',
    verifiedPresentInCommit: true,
    technicalFinding:
      'No construtor de MainForm (linha 107), Shown dispara await Task.Run(FillIdentificationTab). Dentro de FillIdentificationTab(), o método SetId(key, text) (linha 258) altera diretamente label.Text em controles WinForms criados na thread de UI sem verificar InvokeRequired/BeginInvoke. Adicionalmente, OnManualApply (linha 893) executa Task.Run(async () => await RunSamplingAsync()), chamando UpdateFromSample(snapshot) e mutando DataGridViews (_gridTargetLp, _gridCore, _gridAudit) fora da thread STA da UI.',
    securityOrDiagnosticImpact:
      'Causa InvalidOperationException (Cross-thread operation not valid) ou corrupção de estado visual do DataGridView no Windows em execução real.',
    v2Resolution:
      'Separação estrita entre coleta assíncrona em background (Task.Run apenas para I/O e cálculo puro) e atualização de controles exclusivamente na thread de UI (ou estado reativo imutável na suíte v2).',
    reusableFromPhase1: 'Apenas os textos explicativos em UiTexts.cs.',
  },
  {
    id: 'AUD-02',
    title: 'Verificação de compatibilidade de CPU com comportamento Fail-Open',
    severity: 'Crítica',
    fileAndLines: 'desktop/src/IrisXe.Thermal.App/MainForm.cs (linhas 130–145, 153–228, 1185–1193)',
    verifiedPresentInCommit: true,
    technicalFinding:
      'RunSamplingAsync() (linha 1185) bloqueia a leitura apenas se if (_cpuGateReason is not null). Porém, quando o aplicativo inicia antes de FillIdentificationTab concluir, ou em ambiente não-Windows (linha 153), ou quando a string Identifier no registro está vazia (linha 173), ou se a leitura do registro lançar exceção (capturada na linha 225), _cpu permanece null e _cpuGateReason permanece null. Assim, a trava falha aberta (fail-open) e permite amostragem.',
    securityOrDiagnosticImpact:
      'Viola o requisito de segurança de impedir leituras quando a assinatura do processador alvo não foi positivamente confirmada.',
    v2Resolution:
      'Política Fail-Closed implementada em parseCpuSignature e no motor: leituras de registradores específicos de modelo só são liberadas quando canExecuteTargetMsrDecode === true.',
    reusableFromPhase1: 'Estrutura base do record CpuSignature após correção para fail-closed.',
  },
  {
    id: 'AUD-03',
    title: 'Identificação de Tiger Lake-U (Modelo 0x8C) tratada como exclusiva do i7-1195G7',
    severity: 'Alta',
    fileAndLines: 'desktop/src/IrisXe.Thermal.Core/Hardware/CpuSignature.cs (linhas 21, 39, 63)',
    verifiedPresentInCommit: true,
    technicalFinding:
      'A propriedade IsTigerLake1195G7 (linha 39) verifica apenas IsIntelFamily6 && Model == 0x8C. Entretanto, Family 6 Model 0x8C (140) identifica toda a família Tiger Lake-UP3/UP4 (incluindo Core i3-1115G4, i5-1135G7, i7-1165G7 e i7-1185G7), não exclusivamente o i7-1195G7.',
    securityOrDiagnosticImpact:
      'Qualquer outro processador Tiger Lake-U é rotulado falsamente como "Confirmado: Tiger Lake-U i7-1195G7" sem validar BrandName/SKU.',
    v2Resolution:
      'Separação explícita entre isTigerLakeUArchitecture (Family 6, Model 0x8C) e isExactI7_1195G7Sku (validação cruzada do SKU em ProcessorNameString), emitindo alerta explícito de divergência de SKU.',
    reusableFromPhase1: 'Regex de extração Family/Model/Stepping.',
  },
  {
    id: 'AUD-04',
    title: 'Possibilidade de OverflowException na conversão de identificadores numéricos CPUID',
    severity: 'Média',
    fileAndLines: 'desktop/src/IrisXe.Thermal.Core/Hardware/CpuSignature.cs (linhas 26–28, 83–85)',
    verifiedPresentInCommit: true,
    technicalFinding:
      'A expressão regular usa \\d+ sem limite de dígitos e chama int.Parse(...) diretamente nas linhas 83–85. Se o valor no registro contiver um número acima de Int32.MaxValue, int.Parse lança OverflowException em vez de FormatException, escapando do bloco catch (FormatException) em MainForm.cs (linha 188).',
    securityOrDiagnosticImpact:
      'Exceção não tratada durante a inicialização da aba de identificação.',
    v2Resolution:
      'Uso de parseBoundedInt / int.TryParse com limite estrito de dígitos e faixa válida (Family <= 255, Model <= 65535, Stepping <= 255).',
    reusableFromPhase1: 'Lógica de validação de família 6.',
  },
  {
    id: 'AUD-05',
    title: 'Ordem invertida de leitura entre MSR 0x19C/0x1B1 e MSR 0x1A2',
    severity: 'Crítica',
    fileAndLines: 'desktop/src/IrisXe.Thermal.Core/Diagnostics/DiagnosticEngine.cs (linhas 53–163)',
    verifiedPresentInCommit: true,
    technicalFinding:
      'Em CaptureSample(), o motor lê e decodifica IA32_THERM_STATUS (0x19C, linha 53) e MSR_PACKAGE_THERM_STATUS (0x1B1, linha 88) ANTES de ler MSR_TEMPERATURE_TARGET (0x1A2, linha 135). Na linha 55, faz int? tjMax = LastSample?.TemperatureTarget?.TjMaxC. Consequentemente, na primeira amostragem (LastSample == null), tjMax é sempre null e nenhuma temperatura em °C é calculada para os núcleos ou pacote, apesar de 0x1A2 ter sido lido na mesma rodada.',
    securityOrDiagnosticImpact:
      'Descarta a temperatura absoluta em °C na primeira leitura e utiliza o TjMAX defasado da amostra anterior nas leituras seguintes.',
    v2Resolution:
      'Ordem corrigida em captureAndDecodeMsrSnapshot: 1º lê/decodifica 0x1A2 (obtendo TjMAX atual), 2º lê/decodifica 0x19C com o TjMAX atual, 3º lê/decodifica 0x1B1 com o TjMAX atual.',
    reusableFromPhase1: 'Decodificadores de campos de bits após inversão da ordem.',
  },
  {
    id: 'AUD-06',
    title: 'Inconsistência na indicação de leituras simuladas em falhas do ManualMsrReader',
    severity: 'Média',
    fileAndLines: 'desktop/src/IrisXe.Thermal.Core/Access/ManualMsrReader.cs (linha 86) & IMsrReader.cs (linha 22)',
    verifiedPresentInCommit: true,
    technicalFinding:
      'Quando ManualMsrReader está ativo (IsSimulated = true), mas um LP específico ainda não recebeu valor manual, Read() chama MsrReadResult.Fail(...), que fixa Simulated = false (IMsrReader.cs linha 22). O log de auditoria passa a misturar registros com Simulated = false dentro de uma sessão puramente simulada.',
    securityOrDiagnosticImpact:
      'Inconsistência de auditoria entre o cabeçalho da sessão (modo_simulado: true) e registros individuais (simulated: nao).',
    v2Resolution:
      'MsrReadResult.Fail recebe explicitamente o estado simulated do leitor ativo (reader.IsSimulated).',
    reusableFromPhase1: 'Contrato somente-leitura IMsrReader.',
  },
  {
    id: 'AUD-07',
    title: 'Tratamento incompleto do MSR 0x1B1 (escopo de Package e ausência de verificação de validade)',
    severity: 'Alta',
    fileAndLines: 'desktop/src/IrisXe.Thermal.Core/Decoding/PackageThermStatusDecoding.cs (linha 39) & DiagnosticEngine.cs (linhas 88–119)',
    verifiedPresentInCommit: true,
    technicalFinding:
      'PackageThermStatusDecoding.Decode calcula TemperatureC = tjMaxC - readout (linha 39) sem verificar se a leitura é válida (bit 31 / readout válido), ao contrário de ThermStatusDecoding que verifica ReadingValid (bit 31). Assim, um valor 0x00000000 com tjMax=100 reporta falsamente que o pacote está a 100 °C.',
    securityOrDiagnosticImpact:
      'Falso positivo grave: reporta temperatura de pacote igual a TjMAX (100 °C) quando o registrador zerado/inválido tem DigitalReadout = 0.',
    v2Resolution:
      'Adicionada verificação explícita de validade (bit 31 / readout válido) em decodePackageThermStatus0x1B1 antes de calcular TemperatureC.',
    reusableFromPhase1: 'Mapeamento dos bits 0..11 do pacote.',
  },
  {
    id: 'AUD-08',
    title: 'Coleções expostas como somente leitura, mas mutáveis em tempo de execução',
    severity: 'Média',
    fileAndLines: 'desktop/src/IrisXe.Thermal.Core/Diagnostics/DiagnosticEngine.cs (linha 33) & MsrAddress.cs (linha 19)',
    verifiedPresentInCommit: true,
    technicalFinding:
      'DiagnosticEngine.TransitionLog é exposto como public List<TransitionEvent> TransitionLog { get; } = new() — qualquer consumidor pode chamar TransitionLog.Clear(), violando a garantia de log imutável. Além disso, MsrAddress.All é new[] { 0x1A2, 0x19C, 0x1B1 } atribuído a IReadOnlyList<int>, permitindo cast ((int[])MsrAddress.All)[0] = 0x610.',
    securityOrDiagnosticImpact:
      'Permite adulteração em memória da lista fechada de MSRs autorizados e limpeza do histórico de transições.',
    v2Resolution:
      'Uso de coleções verdadeiramente imutáveis (Array.AsReadOnly / ImmutableArray no C# e Object.freeze no TypeScript).',
    reusableFromPhase1: 'Definições de constantes 0x1A2, 0x19C e 0x1B1.',
  },
  {
    id: 'AUD-09',
    title: 'Manifesto do aplicativo (app.manifest) exigindo requireAdministrator sem necessidade técnica na Fase 1',
    severity: 'Alta',
    fileAndLines: 'desktop/src/IrisXe.Thermal.App/app.manifest (linha 9)',
    verifiedPresentInCommit: true,
    technicalFinding:
      'O arquivo app.manifest declara <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />, embora a Fase 1 não possua driver algum e realize apenas leitura de chaves públicas de descrição de hardware em HKLM e decodificação simulada.',
    securityOrDiagnosticImpact:
      'Viola o princípio do menor privilégio (Seção 13: "Não solicitar privilégios de administrador sem necessidade técnica comprovada").',
    v2Resolution:
      'Alterado para level="asInvoker" por padrão. Elevação só é solicitada sob demanda e com consentimento explícito se o usuário optar por iniciar sessão ETW/PresentMon de sistema.',
    reusableFromPhase1: 'Declaração de compatibilidade Windows 10/11 no manifesto.',
  },
  {
    id: 'AUD-10',
    title: 'ReadPolicy.SelfCheck() retornando textos estáticos fixos em vez de validação efetiva',
    severity: 'Média',
    fileAndLines: 'desktop/src/IrisXe.Thermal.Core/Security/ReadPolicy.cs (linhas 20–48)',
    verifiedPresentInCommit: true,
    technicalFinding:
      'O método ReadPolicy.SelfCheck() apenas instancia e retorna uma lista literal de 7 tuplas de strings fixas, sem inspecionar em tempo de execução a lista de endereços, a reflexão da interface IMsrReader ou o comportamento dos decodificadores.',
    securityOrDiagnosticImpact:
      'Passa falsa sensação de auditoria em tempo de execução mesmo que uma regressão altere a política.',
    v2Resolution:
      'Implementado runRuntimeSecuritySelfCheck() que testa efetivamente imutabilidade, recusa de endereços proibidos, ordem de decodificação na 1ª amostra e trava fail-closed.',
    reusableFromPhase1: 'Conceito de painel de garantias estruturais.',
  },
  {
    id: 'AUD-11',
    title: 'Exportação CSV com escape incompleto (ausência de \\r e proteção contra CSV Injection)',
    severity: 'Média',
    fileAndLines: 'desktop/src/IrisXe.Thermal.Core/Export/ExportService.cs (linhas 23–36, 88–91)',
    verifiedPresentInCommit: true,
    technicalFinding:
      'O método Escape(string field) na linha 88 verifica apenas field.Contains(";") || field.Contains("\\"") || field.Contains("\\n"), ignorando "\\r" (quebra de linha CR) e caracteres iniciais de fórmula (=, +, -, @), além de não aplicar Escape nos campos Status e RawHex.',
    securityOrDiagnosticImpact:
      'Arquivos CSV exportados com mensagens de erro multilinhas do Windows (\\r\\n) quebram a estrutura de colunas.',
    v2Resolution:
      'Escape completo de ";", ",", "\\"", "\\r", "\\n" e sanitização opcional de PII/caminhos de usuário em todas as colunas.',
    reusableFromPhase1: 'Estrutura de exportação pura desacoplada de SaveFileDialog.',
  },
  {
    id: 'AUD-12',
    title: 'Lacuna Arquitetural Central: Ausência total de diagnóstico da GPU Iris Xe, Frametime, Apresentação e Screen Tearing',
    severity: 'Arquitetural',
    fileAndLines: 'Escopo global da solução IrisXeThermal.sln',
    verifiedPresentInCommit: true,
    technicalFinding:
      'O projeto da Fase 1 concentrou 100% do esforço em decodificar 3 MSRs térmicos da CPU (0x1A2, 0x19C, 0x1B1) sem implementar coleta ou análise de GPU Iris Xe (frequência, 96 EUs, GPU Busy/Wait), PresentMon, HWiNFO64, cadeia DXGI/DWM, screen tearing em 100 Hz, VRR ou correlação temporal.',
    securityOrDiagnosticImpact:
      'Incapaz de responder à pergunta central do usuário sobre quedas de FPS, microtravamentos, frametime irregular e screen tearing no Valorant.',
    v2Resolution:
      'Arquitetura Iris Xe Diagnostic Suite v2 completa: parsers reais de PresentMon e HWiNFO64, sincronizador temporal, analisador da cadeia de apresentação/tearing em 100 Hz, verificador VRR em 3 camadas, motor causal de hipóteses com níveis de confiança e comparador A/B.',
    reusableFromPhase1: 'Módulo de decodificação térmica MSR integrado como uma das fontes de evidência da CPU.',
  },
]);
