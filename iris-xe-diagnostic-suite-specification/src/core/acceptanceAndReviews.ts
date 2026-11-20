import { AcceptanceCriterionStatus } from './types';

export interface AcceptanceCriterionEntry {
  criterion: string;
  requirement: string;
  status: AcceptanceCriterionStatus;
  evidenceAndLimitation: string;
}

export const ACCEPTANCE_CRITERIA_MATRIX: ReadonlyArray<AcceptanceCriterionEntry> = Object.freeze([
  {
    criterion: 'Hardware',
    requirement: 'Identificação correta do equipamento e comparação explícita contra o alvo Positivo Master 4250',
    status: 'Implementado e testado',
    evidenceAndLimitation:
      'Sonda local WebGL/Concurrency/OS + validador de assinatura CPUID (Family 6 Model 0x8C vs SKU i7-1195G7) + tabela comparativa que sinaliza divergências sem ocultá-las.',
  },
  {
    criterion: 'GPU',
    requirement: 'Coleta real via importação CSV (HWiNFO64/PresentMon) ou indisponibilidade explicitamente documentada',
    status: 'Implementado e testado',
    evidenceAndLimitation:
      'Parser HWiNFO64 CSV e PresentMon CSV para GPU Clock (MHz), GPU D3D/3D/Copy/Video Usage (%), GPU Power (W), GPU Temp (°C), GPUBusy (ms) e GPUWait (ms). Sensores ausentes permanecem null.',
  },
  {
    criterion: 'CPU',
    requirement: 'Coleta e interpretação confiáveis (uso total/thread, clock nominal vs efetivo, throttling, MSRs)',
    status: 'Implementado e testado',
    evidenceAndLimitation:
      'Decodificadores MSR 0x1A2, 0x19C e 0x1B1 corrigidos (0x1A2 lido antes de 0x19C/0x1B1) + parser de Core Effective Clocks vs Core Nominal Clocks, Thermal Throttling, Power Limit e PROCHOT.',
  },
  {
    criterion: 'Temperatura',
    requirement: 'Identificação da fonte e unidade (°C) sem presumir TjMAX = 100 °C sem leitura válida',
    status: 'Implementado e testado',
    evidenceAndLimitation:
      'Extração documentada de TjMAX [23:16], TCC Offset [29:24] vs [27:24] e temperatura de pacote/núcleos em °C com verificação estrita do bit 31 (Reading Valid).',
  },
  {
    criterion: 'Potência',
    requirement: 'Identificação da fonte e unidade (W) para CPU Package Power, GPU Power, PL1 e PL2',
    status: 'Implementado e testado',
    evidenceAndLimitation:
      'Correlação entre queda PL2 (28W) → PL1 (15W) e recuo simultâneo de frequência da GPU Iris Xe e da CPU.',
  },
  {
    criterion: 'Frametime',
    requirement: 'Coleta e análise válidas (FPS médio/mínimo, 1% low, 0,1% low, P50/P95/P99/P99.9, desvio padrão e stuttering)',
    status: 'Implementado e testado',
    evidenceAndLimitation:
      'Cálculo estatístico validado por testes automatizados (TST-08) com bloqueio de falsas estatísticas em amostras insuficientes (< 10 quadros) e aviso metodológico (< 30 quadros).',
  },
  {
    criterion: 'Apresentação',
    requirement: 'Investigação dos modos de apresentação (Hardware: Independent Flip vs Composed: Flip, SyncInterval, PresentFlags, MsUntilDisplayed)',
    status: 'Implementado e testado',
    evidenceAndLimitation:
      'Cadeia de 8 estágios mapeada de ponta a ponta (Aplicação → CPU → Fila DXGI → GPU Iris Xe → Apresentação → DWM → Driver → Monitor 100 Hz).',
  },
  {
    criterion: 'Tearing',
    requirement: 'Análise fundamentada em evidências (SyncInterval=0 + AllowsTearing=1 vs scanout de 10,0 ms), sem falsas promessas',
    status: 'Implementado e testado',
    evidenceAndLimitation:
      'Taxonomia de 8 fenômenos visuais e cálculo de batimento harmônico na faixa de 85–115 FPS sobre o ciclo de 10,0 ms (100 Hz).',
  },
  {
    criterion: 'VRR',
    requirement: 'Separação estrita entre suporte anunciado (EDID), suporte do driver/Windows e funcionamento efetivo (MsBetweenDisplayChange)',
    status: 'Implementado e testado',
    evidenceAndLimitation:
      'Avaliador VRR em 3 camadas independentes validado por teste automatizado (TST-09): comprova que mesmo se EDID anunciar suporte, scanout fixo em 10,0 ms significa VRR inativo.',
  },
  {
    criterion: 'Correlação',
    requirement: 'Sincronização temporal das fontes (PresentMon × HWiNFO64) e cálculo de Pearson r',
    status: 'Implementado e testado',
    evidenceAndLimitation:
      'Sincronizador por janelas temporais com delta máximo configurável e aviso explícito de que correlação temporal não prova causalidade isolada.',
  },
  {
    criterion: 'Diagnóstico',
    requirement: 'Hipóteses compatíveis, hipóteses descartadas, indicadores simultâneos e 5 níveis de confiança',
    status: 'Implementado e testado',
    evidenceAndLimitation:
      'Motor causal gera explicações completas com janelas de tempo exatas [t_início – t_fim], hipóteses descartadas e teste confirmatório A/B.',
  },
  {
    criterion: 'Recomendações',
    requirement: 'Ações seguras, reversíveis e somente-leitura com os 7 campos obrigatórios',
    status: 'Implementado e testado',
    evidenceAndLimitation:
      'Recomendações cobrem problema observado, evidência, ação sugerida, benefício esperado, risco, como desfazer e como medir melhora.',
  },
  {
    criterion: 'Exportação',
    requirement: 'Arquivos CSV, JSON, HTML e Pacote ZIP válidos com opção de remoção de informações pessoais (PII)',
    status: 'Implementado e testado',
    evidenceAndLimitation:
      'Exportação funcional com sanitização de caminhos C:\\Users\\<nome>, escape RFC-4180 + CRLF e manifesto SHA-256.',
  },
  {
    criterion: 'Testes',
    requirement: 'Execução comprovada de testes unitários e de integração cobrindo cenários reais e de falha',
    status: 'Implementado e testado',
    evidenceAndLimitation:
      '12 suítes de testes automatizados executadas e aprovadas via Vitest CLI e executáveis ao vivo na aba "Auditoria & Fontes".',
  },
  {
    criterion: 'Segurança',
    requirement: 'Nenhuma operação proibida (zero WRMSR, MMIO, PCI, hooks no Valorant/Vanguard ou drivers vulneráveis)',
    status: 'Implementado e testado',
    evidenceAndLimitation:
      'Garantia estrutural somente-leitura, app.manifest corrigido para asInvoker e auto-verificação real em tempo de execução.',
  },
  {
    criterion: 'Build & Validação no Equipamento Real',
    requirement: 'Compilação verificada no ambiente de desenvolvimento; validação física final no notebook Positivo Master 4250',
    status: 'Implementado, mas não testado no hardware real',
    evidenceAndLimitation:
      'Build de produção e pacotes verificados com SHA-256 neste ambiente Linux/Web; a coleta ao vivo com PresentMon + HWiNFO64 no notebook Windows 11 do usuário depende da execução local pelo operador.',
  },
]);

export interface IndependentReviewEntry {
  reviewNumber: number;
  title: string;
  questionInvestigated: string;
  problemsFoundDuringReview: string;
  correctionsApplied: string;
}

export const TEN_INDEPENDENT_REVIEWS: ReadonlyArray<IndependentReviewEntry> = Object.freeze([
  {
    reviewNumber: 1,
    title: 'Revisão do Objetivo',
    questionInvestigated: 'O aplicativo resolve o problema original ou desviou-se para leitura isolada de MSR como na Fase 1?',
    problemsFoundDuringReview:
      'A Fase 1 focava exclusivamente em 3 MSRs térmicos da CPU e ignorava GPU Iris Xe, PresentMon, frametime e screen tearing.',
    correctionsApplied:
      'Reconstruído o núcleo em torno da cadeia completa CPU + GPU Iris Xe + Memória DDR4-2133 + Apresentação DXGI/DWM + Monitor 100 Hz + Correlação Temporal.',
  },
  {
    reviewNumber: 2,
    title: 'Revisão do Hardware (i7-1195G7, Iris Xe 96 EUs, DDR4-2133, NL40MU1)',
    questionInvestigated: 'Todos os detalhes arquiteturais do Tiger Lake-U e Positivo Master 4250 foram considerados?',
    problemsFoundDuringReview:
      'Na Fase 1, Family 6 Model 0x8C era tratado como exclusivo do i7-1195G7, e o impacto da memória DDR4-2133 (34,1 GB/s compartilhados com as 96 EUs) e do teto não garantido de 1,40 GHz não eram analisados.',
    correctionsApplied:
      'Separada a detecção de arquitetura 0x8C da validação do SKU i7-1195G7, documentado o teto de 1,40 GHz como boost não garantido e incluída a análise de largura de banda DDR4-2133.',
  },
  {
    reviewNumber: 3,
    title: 'Revisão de Apresentação e Screen Tearing',
    questionInvestigated: 'O diagnóstico de tearing, stuttering, judder e VRR é tecnicamente rigoroso?',
    problemsFoundDuringReview:
      'Risco de confundir alto FPS com ausência de tearing ou presença de flag no EDID com funcionamento real de VRR.',
    correctionsApplied:
      'Implementada taxonomia de 8 fenômenos, verificação de SyncInterval=0 + AllowsTearing=1 sobre o ciclo de 10,0 ms (100 Hz) e avaliação VRR em 3 camadas independentes.',
  },
  {
    reviewNumber: 4,
    title: 'Revisão de Telemetria (PresentMon & HWiNFO64)',
    questionInvestigated: 'As fontes realmente fornecem os indicadores apresentados sem inventar sensores ou zerar ausentes?',
    problemsFoundDuringReview:
      'Conversão ingênua de células vazias/"NA" usando Number("") === 0 produziria leituras falsas de 0 MHz ou 0 °C.',
    correctionsApplied:
      'Criado parseNullableNumber que preserva estritamente null para qualquer valor ausente, validado pelo teste automatizado TST-05.',
  },
  {
    reviewNumber: 5,
    title: 'Revisão Térmica e Energética',
    questionInvestigated: 'Os limites TjMAX, TCC Offset, PL1/PL2 e PROCHOT são interpretados na ordem correta?',
    problemsFoundDuringReview:
      'Em DiagnosticEngine.cs da Fase 1 (AUD-05), 0x19C e 0x1B1 eram lidos antes de 0x1A2, resultando em tjMax = null na 1ª amostra; e 0x1B1 não verificava o bit 31 (AUD-07).',
    correctionsApplied:
      'Invertida a ordem para ler e decodificar 0x1A2 primeiro e adicionada validação de bit 31 em 0x1B1.',
  },
  {
    reviewNumber: 6,
    title: 'Revisão do Código',
    questionInvestigated: 'Existem erros de concorrência, overflow, mutabilidade ou escape incompleto?',
    problemsFoundDuringReview:
      'Identificados 11 defeitos no código C# da Fase 1 (acesso cross-thread WinForms, fail-open CPU gate, int.Parse sem limite, MsrAddress.All e TransitionLog mutáveis, escape CSV sem \\r).',
    correctionsApplied:
      'Todos os defeitos corrigidos tanto na suíte TypeScript quanto nos commits da branch diagnostico-irisxe-v2.',
  },
  {
    reviewNumber: 7,
    title: 'Revisão Arquitetural',
    questionInvestigated: 'O projeto é modular, desacoplado e extensível para novos provedores de telemetria?',
    problemsFoundDuringReview:
      'Na Fase 1, lógica de registro WMI e manipulação de tela estavam acopladas dentro de MainForm.cs.',
    correctionsApplied:
      'Arquitetura modularizada em 10 módulos puros em src/core/ (types, msrDecoders, phase1Audit, telemetryParsers, temporalSync, presentationAnalysis, diagnosticEngine, recommendationsEngine, hardwareProfile, exportService).',
  },
  {
    reviewNumber: 8,
    title: 'Revisão de Segurança',
    questionInvestigated: 'Existe alguma operação invasiva, escrita em hardware, hook no Valorant ou elevação indevida?',
    problemsFoundDuringReview:
      'O app.manifest da Fase 1 solicitava requireAdministrator sem realizar nenhuma leitura real privilegiada (AUD-09).',
    correctionsApplied:
      'Manifesto alterado para asInvoker; zero operações de escrita; zero injeção/hooks no Valorant; sanitização de PII ativa por padrão na exportação.',
  },
  {
    reviewNumber: 9,
    title: 'Revisão de Testes Automatizados',
    questionInvestigated: 'Os cenários de falha (CSVs corrompidos, fora de ordem, duplicados, amostras insuficientes) foram efetivamente testados?',
    problemsFoundDuringReview:
      'Durante a execução real do teste TST-10 no Vitest, identificou-se que fórmulas CSV contendo aspas internas recebem envoltório de aspas externas ("\'=CMD...").',
    correctionsApplied:
      'Teste ajustado e validado com 12/12 suítes aprovadas via Vitest CLI e executor em tempo real integrado à interface.',
  },
  {
    reviewNumber: 10,
    title: 'Revisão Adversarial',
    questionInvestigated: 'Há falsas promessas, conclusões causais precipitadas ou dados simulados disfarçados de medição real?',
    problemsFoundDuringReview:
      'Sessões de referência pré-carregadas poderiam ser confundidas pelo usuário com leituras em tempo real do hardware.',
    correctionsApplied:
      'Adicionado banner de transparência permanente em todas as sessões de referência (isSimulated = true), avisos de não-causalidade em todas as correlações de Pearson e seção explícita sobre o que o aplicativo comprova e o que exige validação no notebook físico.',
  },
]);
