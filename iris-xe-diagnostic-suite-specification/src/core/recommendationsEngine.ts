import { DiagnosticFinding, FrametimeStats, SafeRecommendation } from './types';

export function generateSafeRecommendations(
  findings: DiagnosticFinding[],
  stats: FrametimeStats,
  monitorRefreshHz: number
): SafeRecommendation[] {
  const recommendations: SafeRecommendation[] = [];

  const hasThermalPowerFinding = findings.some((f) => f.id === 'diag-thermal-power-coupling');
  const hasTearingFinding = findings.some((f) => f.id === 'diag-screen-tearing-mechanism');
  const hasLowGpuUsageFinding = findings.some((f) => f.id === 'diag-low-gpu-usage-cpu-wait');

  if (hasThermalPowerFinding) {
    recommendations.push({
      id: 'rec-fps-cap-thermal-budget',
      title: 'Testar limite de FPS controlado no jogo (ex.: 117 FPS) para preservar orçamento térmico e energético do Package',
      category: 'Controle Térmico & Estabilidade de Frametime',
      priority: 'Alta',
      observedProblem:
        'A execução com FPS ilimitado faz a CPU i7-1195G7 e a GPU Iris Xe disputarem simultaneamente o limite de potência do package (PL2 → PL1) e atingirem ~100–102 °C, provocando quedas abruptas de clock e picos de frametime (stuttering).',
      evidence:
        `P99 de frametime em ${stats.p99FrametimeMs ?? '—'} ms (1% Low = ${stats.fps1PercentLow ?? '—'} FPS) coincidente com janelas de throttling térmico/potência no HWiNFO64.`,
      suggestedAction:
        'Dentro das configurações de Vídeo → Geral do próprio Valorant, ativar "Limitar FPS Sempre" e testar o valor 117 FPS (ou 97 FPS se preferir margem térmica maior) mantendo V-Sync DESLIGADO e Tela Cheia.',
      expectedBenefit:
        'Reduz a dissipação contínua da CPU nos momentos de pico, preservando folga térmica/energética para as 96 EUs da Iris Xe durante combates intensos e melhorando a estabilidade do 1% Low (sem prometer eliminação total de variações).',
      risk:
        'Nenhum risco ao hardware ou ao Vanguard (configuração nativa interna do jogo).',
      howToUndo:
        'No menu Vídeo → Geral do Valorant, alterar "Limitar FPS Sempre" de volta para "Desligado".',
      howToMeasureImprovement:
        'Gravar nova sessão de 120 segundos no The Range com PresentMon + HWiNFO64 e verificar no Comparador A/B se o 1% Low subiu, se o desvio padrão do frametime caiu e se o tempo em Thermal Throttling diminuiu.',
    });

    recommendations.push({
      id: 'rec-physical-cooling-power-plan',
      title: 'Inspeção de fluxo de ar físico e comparação do Modo de Energia nativo do Windows 11 (Equilibrado vs Melhor Desempenho)',
      category: 'Temperatura & Energia',
      priority: 'Alta',
      observedProblem:
        'O package Tiger Lake-U na placa-mãe NL40MU1 atinge rapidamente a temperatura de ativação do TCC (~100 °C), forçando recuo severo de frequência tanto dos núcleos da CPU quanto da GPU integrada.',
      evidence:
        'Leituras de temperatura de CPU próximas de 100–102 °C e ativação dos indicadores de limitação térmica e de potência.',
      suggestedAction:
        '1) Elevar a traseira do notebook Positivo Master 4250 em 2 a 3 cm em superfície rígida para desobstruir a captação inferior de ar; 2) Realizar teste A/B usando o perfil de energia "Equilibrado" nativo do Windows 11 (sem perfis agressivos de boost contínuo em repouso) para permitir resfriamento entre rodadas.',
      expectedBenefit:
        'Maior sustentação do clock efetivo antes de atingir o limite térmico do TCC e menor frequência de eventos de PROCHOT/Thermal Status.',
      risk:
        'Zero risco de sistema (não altera registradores MSR, PL1/PL2, BIOS ou tensões).',
      howToUndo:
        'Retornar o seletor de Modo de Energia em Configurações → Sistema → Energia e Bateria do Windows 11 para a opção anterior.',
      howToMeasureImprovement:
        'Comparar a curva de Temperatura do Package (°C) e Frequência Efetiva da CPU (MHz) após 3 minutos de carga contínua entre as duas sessões.',
    });
  }

  if (hasTearingFinding) {
    recommendations.push({
      id: 'rec-non-harmonic-fps-cap-tearing',
      title: `Mitigar linha estacionária de Screen Tearing em ${monitorRefreshHz} Hz com limite de FPS não-harmônico (mantendo V-Sync Desligado)`,
      category: 'Apresentação & Screen Tearing',
      priority: 'Alta',
      observedProblem:
        `Com V-Sync desligado (SyncInterval=0, AllowsTearing=1) em um monitor de ${monitorRefreshHz} Hz fixos (10,0 ms/ciclo), quando a taxa de quadros passa perto de 100 FPS (ou múltiplos exatos), a linha horizontal de tearing permanece quase parada na mesma faixa da tela por vários quadros seguidos.`,
      evidence:
        'PresentMon confirma Hardware: Independent Flip com SyncInterval=0, AllowsTearing=1 e monitor operando em scanout fixo de 10,0 ms sem VRR ativo.',
      suggestedAction:
        'Como você prefere jogar com V-Sync desligado para evitar input lag, evite limitar o FPS exatamente em 100 FPS. Configure o limitador interno do jogo em um valor ligeiramente deslocado da frequência de 100 Hz (por exemplo, 117 FPS ou 96 FPS).',
      expectedBenefit:
        'Não elimina fisicamente o tearing (impossível com SyncInterval=0 sem VRR), mas faz a fase da troca de buffer percorrer verticalmente a tela de forma rápida e distribuída entre varreduras sucessivas, tornando o corte horizontal muito menos evidente ao olho sem adicionar a latência do V-Sync.',
      risk:
        'Nenhum risco. Mantém PresentMode em Independent Flip com baixa latência.',
      howToUndo:
        'Restaurar o valor anterior do limitador de FPS nas configurações de vídeo do jogo.',
      howToMeasureImprovement:
        'Comparar a percepção visual em movimento horizontal rápido de câmera no The Range e verificar no PresentMon que MsUntilDisplayed permaneceu baixo (< 12 ms).',
    });

    recommendations.push({
      id: 'rec-fullscreen-vs-borderless-ab',
      title: 'Comparar Tela Cheia Exclusiva (Independent Flip) vs Janela Sem Bordas (Apenas em Teste A/B Controlado)',
      category: 'Apresentação & Sincronização',
      priority: 'Média',
      observedProblem:
        'Dúvida entre a intensidade do tearing em Independent Flip versus o custo real de input lag e quadros repetidos ao passar pelo compositor do Windows (DWM) ou V-Sync.',
      evidence:
        `Sessão atual apresenta ${stats.droppedFramesTotal} quadros descartados e ${stats.repeatedFramesTotal} varreduras repetidas.`,
      suggestedAction:
        'Executar um único teste comparativo A/B de 60 segundos no The Range alternando apenas entre Tela Cheia e Tela Cheia Sem Bordas (ou V-Sync Ligado apenas para medição comparativa, nunca como imposição padrão).',
      expectedBenefit:
        'Fornece evidência numérica exata (em milissegundos de MsUntilDisplayed e 1% Low) do trade-off entre ausência de tearing e aumento de input lag neste equipamento específico.',
      risk:
        'Zero risco; alteração feita apenas na interface de vídeo do jogo durante o teste.',
      howToUndo:
        'Voltar imediatamente para Tela Cheia Exclusiva com V-Sync Desligado após concluir a captura comparativa.',
      howToMeasureImprovement:
        'Usar a aba "Sessões de Teste (A/B)" deste aplicativo para comparar o delta exato de MsUntilDisplayed (ms) e Eventos de Stuttering entre a Sessão A e a Sessão B.',
    });
  }

  if (hasLowGpuUsageFinding) {
    recommendations.push({
      id: 'rec-cpu-thread-and-driver-regression',
      title: 'Reduzir contenção de Thread Principal da CPU, overlays em segundo plano e auditar versão do Driver Intel GFX',
      category: 'GPU Iris Xe, CPU & Driver',
      priority: 'Média',
      observedProblem:
        'A GPU Iris Xe (96 EUs) apresenta quedas de utilização e GPUWait elevado nos momentos de microtravamento porque aguarda a CPU entregar comandos de renderização e compartilha o barramento de memória DDR4-2133 (34,1 GB/s).',
      evidence:
        `Percentual de tempo da GPU acima de 1300 MHz em ${stats.pctTimeGpuAbove1300Mhz ?? '—'}% e saturação de thread de CPU durante os ${stats.stutterEventsCount} eventos de stuttering.`,
      suggestedAction:
        '1) Desativar overlays de captura/chat (Discord Overlay, Xbox Game Bar, gravadores em background) durante a sessão de jogo para reduzir disputas de agendamento nos 4 núcleos / 8 threads e hooks DXGI; 2) Registrar a versão exata do driver Intel Graphics (série 31.0.101.xxxx / 32.0.101.xxxx) em cada sessão para identificar se houve regressão de compilação de shaders após atualização do Windows 11 25H2.',
      expectedBenefit:
        'Redução de interrupções de contexto nos 4 núcleos físicos do i7-1195G7 e redução de GPUWait nos picos de frametime.',
      risk:
        'Baixo risco; não desativa serviços críticos do Windows nem interfere no Riot Vanguard.',
      howToUndo:
        'Reabilitar os aplicativos ou overlays nas respectivas configurações de usuário.',
      howToMeasureImprovement:
        'Verificar redução na contagem de Eventos de Stuttering e queda no valor médio de GPUWait (ms) na sessão seguinte.',
    });
  }

  return recommendations;
}
