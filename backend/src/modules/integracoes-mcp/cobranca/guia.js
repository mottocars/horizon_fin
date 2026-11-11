const { ferramenta } = require('../dfc/tools/comum');
const { lerConfiguracao } = require('./configuracao');
const { br, hoje } = require('./base');

// cobranca_guia — "comece por aqui": TODAS as regras da Gestão de Cobranças (Operações › Gestão de
// Cobranças) e do relatório Desempenho da Cobrança (Relatórios), com a configuração DESTA empresa ao vivo,
// os pontos de atenção e qual ferramenta usar. As regras são as do código (cobranca-clusters, motor-risco,
// regua-cobranca, rotinas, gestao-parcelas, regua-cobranca-historico, relatorio-desempenho-cobranca) —
// se uma regra mudar lá, mude aqui também.

function linhaEtapa(e) {
  return `${e.dia || 'sem dia'} "${e.etapa}" — ${e.canais.join(' + ') || 'nenhum canal'}${e.template ? `, template ${e.template}` : ', SEM template'}${e.responsavel_da_etapa ? `, responsável da etapa: ${e.responsavel_da_etapa}` : ''} · ${e.situacao}`;
}

// Problemas de configuração que impedem a cobrança de funcionar como o usuário espera.
function alertas(cfg) {
  const a = [];
  const com = cfg.comunicacao;
  const tipo = com.tipo;
  const dist = cfg.distribuicao;
  if (typeof cfg.motor_risco !== 'object') a.push('Sem versão do Motor de Risco: régua, Rotina e clusters não funcionam.');
  if (!cfg.tipos_pagamento.entram_na_cobranca.length) a.push('Nenhum Tipo de Pagamento escolhido: nenhuma parcela entra na cobrança.');
  const foraAbertas = cfg.tipos_pagamento.ficam_fora.filter((t) => t.em_aberto > 0);
  if (foraAbertas.length) a.push(`Tipos de pagamento FORA da cobrança com parcelas em aberto: ${foraAbertas.map((t) => `${t.tipo} (${t.em_aberto})`).join(', ')}.`);
  if (tipo === 'automatica') a.push('Comunicação Automática escolhida, mas não há rotina de disparo: nenhum WhatsApp/e-mail sai e essas colunas ficam pendentes na Rotina.');
  for (const c of cfg.regua) {
    const ativas = c.etapas.filter((e) => e.situacao === 'ativa e na Rotina');
    if (!ativas.length) a.push(`${c.nome}: nenhuma etapa ativa na Rotina — parcelas deste ${c.cluster === 'inad' ? 'estágio' : 'cluster'} não geram tarefa.`);
    const p = com.por_cluster.find((x) => x.cluster === c.cluster);
    if (tipo === 'visualizar') {
      if (ativas.some((e) => e.canais.includes('WhatsApp')) && p?.conexao_whatsapp === 'nenhuma escolhida') a.push(`${c.nome}: há etapa com WhatsApp mas nenhuma conexão Z-API escolhida para o cluster — o envio falha.`);
      if (ativas.some((e) => e.canais.includes('E-mail')) && p?.conexao_email === 'nenhuma escolhida') a.push(`${c.nome}: há etapa com e-mail mas nenhuma conexão de e-mail escolhida para o cluster — o envio falha.`);
    }
    const semTemplate = ativas.filter((e) => (e.canais.includes('WhatsApp') || e.canais.includes('E-mail')) && !e.template);
    if (semTemplate.length && tipo !== 'automatica') a.push(`${c.nome}: etapa(s) ${semTemplate.map((e) => e.dia).join(', ')} com WhatsApp/e-mail SEM template — não dá para enviar nem copiar a mensagem.`);
    const nomeTroca = c.etapas.filter((e) => /^D[+-]\d+$/.test(e.etapa) && e.dia && e.etapa !== e.dia);
    if (nomeTroca.length) a.push(`${c.nome}: etapa com nome diferente do dia (${nomeTroca.map((e) => `"${e.etapa}" está em ${e.dia}`).join(', ')}) — confunde quem lê a Rotina.`);
    if (dist.modo === 'Responsável por etapa' && ativas.some((e) => !e.responsavel_da_etapa)) a.push(`${c.nome}: modo "Responsável por etapa" com etapa sem responsável — essas tarefas ficam "Sem responsável".`);
  }
  if (dist.modo === 'Distribuição automática') {
    if (!dist.atendentes.length) a.push('Distribuição automática ligada sem atendentes cadastrados.');
    const ag = dist.agendamento_no_monitor;
    if (!(typeof ag === 'object' && ag.ativo)) a.push('Distribuição automática ligada, mas a rotina "Distribuição da Rotina de Cobrança" não está ativa no Monitor: o dia só é distribuído se alguém clicar.');
    if (dist.clientes_na_carteira_de_quem_saiu) a.push(`${dist.clientes_na_carteira_de_quem_saiu} cliente(s) ainda na carteira de quem saiu da distribuição (voltam como "liberado" quando aparecerem).`);
  }
  for (const r of cfg.monitor) {
    if (r.rotina === 'cobranca_distribuicao' && dist.modo !== 'Distribuição automática') continue;
    if (r.agendamento.startsWith('SEM') && r.rotina !== 'cobranca_distribuicao') a.push(`Rotina do Monitor "${r.nome.split(' — ')[0]}" sem agendamento ativo.`);
    if (r.ultima_execucao && r.ultima_execucao.status === 'erro') a.push(`A última execução de "${r.nome.split(' — ')[0]}" (${r.ultima_execucao.iniciou}) deu erro: ${r.ultima_execucao.erro}`);
  }
  return a.length ? a : ['Nenhum problema encontrado na configuração.'];
}

const guia = {
  name: 'cobranca_guia',
  description:
    'Comece por aqui. Explica TODAS as regras da Gestão de Cobranças e do relatório Desempenho da Cobrança, com a configuração desta empresa ' +
    'ao vivo: quais parcelas entram na cobrança; o Motor de Risco (score, 5 indicadores, cortes, regra dura, trava de subida, competência); ' +
    'os clusters (Novo, Bom, Duvidoso, Mau) e a Inadimplência; a Régua de Cobrança (etapas D±N por cluster, canais, templates); a Rotina do ' +
    'dia (como cada tarefa nasce, status de cada canal, quem é o responsável); os 3 tipos de comunicação e como o WhatsApp/e-mail sai de ' +
    'verdade (Z-API, SMTP, boleto do Sienge); a Distribuição automática entre atendentes (continuidade, faixas, quantidade, valor, carteira, ' +
    'liberação, pausa, substituição, redistribuição); a Gestão das Parcelas; o histórico de cada parcela; a aba Clientes (Comunicar); o ' +
    'relatório Desempenho da Cobrança (tarefas, feitas, responsável, pagas/abertas/distribuídas); as rotinas do Monitor; pontos de atenção ' +
    'conhecidos; e qual ferramenta usar para cada pergunta.',
  inputSchema: {},
  handler: ferramenta(async (empresaId) => {
    const [cfg, h] = await Promise.all([lerConfiguracao(empresaId), hoje(empresaId)]);
    const mr = typeof cfg.motor_risco === 'object' ? cfg.motor_risco.vigente : null;
    const P = mr?.parametros || {};
    const L = cfg.limite_inadimplencia_dias;
    const com = cfg.comunicacao;
    const dist = cfg.distribuicao;
    const automaticaAg = dist.agendamento_no_monitor;
    const md = [];
    const add = (...l) => md.push(...l);

    add(
      `# Gestão de Cobranças — ${cfg.empresa}`,
      `Hoje (data da Rotina, fuso de Brasília): ${br(h)}. Nada da cobrança é guardado "pronto", exceto 3 coisas: o cluster de cada cliente (gravado a cada recálculo), a distribuição de cada dia (gravada quando ela roda) e os registros de contato (gravados quando alguém registra ou envia). Todo o resto — Rotina, Gestão das Parcelas, relatório — é calculado na hora a partir da base do Sienge gravada no Horizon e da configuração ATUAL.`,
      '',
      '## Telas',
      '- **Operações › Gestão de Cobranças** (`/operacoes/gestao-de-cobrancas`), abas: **Rotinas** (tarefas do dia), **Gestão das Parcelas** (carteira por centro/cliente/parcela), **Clusters de Clientes** (score e cluster de cada cliente), **Motor de Risco** (calibração do score, versões), **Comunicação** (templates de mensagem), **Régua de Cobrança** (etapas por cluster + Configurações Globais: tipo de comunicação, horários/conexões, Tipos de Pagamento, Distribuição da Rotina), **Clientes** (flag Comunicar).',
      '- **Relatórios › Desempenho da Cobrança** (`/relatorios/desempenho-cobranca`): por atendente, as parcelas que eram dela — Pagas, Em aberto e Distribuídas — com interações feitas × devidas.',
      '- Acesso: quem tem a tela vê todo o conteúdo dela (não há mais Comum × Administrador); Master vê tudo.',
      '',
      '## 1. Quais parcelas entram na cobrança (o "universo")',
      'Uma parcela do contas a receber do Sienge entra na Rotina, na Gestão das Parcelas e no relatório só se TODAS forem verdade:',
      '1. **Origem "CO"** (`origin_id = CO`, contas a receber de clientes; as outras origens não são cobrança).',
      '2. **Centro de custo com a etapa "Lançamento"** registrada no Histórico de Etapas (Cronograma de Obras) — empreendimento ainda não lançado não é cobrado. Parcela rateada em 2 centros aparece nos 2 (na Gestão das Parcelas), mas conta 1 vez por cliente na distribuição.',
      '3. **Cliente com "Comunicar" ligado** (aba Clientes; sem marcação = ligado). Desligado, o cliente some da Rotina, da Gestão das Parcelas e do relatório.',
      `4. **Tipo de pagamento** (\`payment_term_description\`) escolhido em Régua › Configurações Globais › Tipos de Pagamentos para Cobrança. Sem nenhum escolhido, NADA entra; tipo novo que aparecer no Sienge fica fora até alguém incluir. Nesta empresa: ${cfg.tipos_pagamento.entram_na_cobranca.length} tipo(s) entram (${cfg.tipos_pagamento.entram_na_cobranca.map((t) => t.tipo).join(', ') || 'nenhum'}); ${cfg.tipos_pagamento.ficam_fora.length} ficam fora.`,
      '5. Para a Rotina e a Gestão das Parcelas "em aberto": **saldo corrigido ≠ 0 hoje**. Parcela paga, renegociada ou com desconto que zerou o saldo sai da Rotina — inclusive dos dias passados, porque a Rotina é recalculada com a base de hoje.',
      'Atenção: o **cluster** (score) do cliente usa TODAS as parcelas CO dele (sem os filtros 2–4) — é o comportamento de pagamento dele como cliente.',
      '',
      '## 2. Motor de Risco (score) — versão vigente',
      mr
        ? `Versão ${mr.versao}, salva em ${mr.criada_em}${mr.criada_por ? ` por ${mr.criada_por}` : ''}. Cada "Salvar" cria uma versão nova (nunca sobrescreve); vale sempre a de maior número. Parâmetros: tolerância ${P.tolerancia_dias} dias · janela ${P.janela_observacao_meses} meses · gatilho de reincidência ${P.gatilho_reincidencia_dias} dias · mínimo ${P.minimo_parcelas} parcelas · trava de subida ${P.trava_subida_parcelas} parcelas · dias vencidos para a régua ${P.dias_vencidos_regua_cobranca} · cortes Bom ≥ ${P.corte_bom_pagador}, Duvidoso ≥ ${P.corte_pagador_duvidoso} · competência vira no dia ${P.dia_recalculo}.`
        : 'NENHUMA versão publicada — sem ela a régua, a Rotina e os clusters não funcionam.',
      ...(mr ? mr.indicadores.map((i) => `- ${i.nome}: nota 0 em ${i.nota_0}, nota 100 em ${i.nota_100}, peso ${i.peso}%.`) : []),
      'Como o score é calculado (por cliente, no recálculo):',
      '- Parcelas consideradas: as **já vencidas** (vencimento ≤ hoje) com vencimento **dentro da janela** de observação. Atraso de parcela **paga** = data do último recebimento − vencimento (mínimo 0); de parcela **vencida em aberto** = hoje − vencimento (cresce todo dia — quem parou de pagar não fica com atraso baixo).',
      '- Indicadores: **% pagas em dia** = parcelas com atraso ≤ tolerância ÷ parcelas da janela; **atraso médio**; **maior atraso**; **reincidência** = parcelas com atraso > gatilho; **relacionamento** = meses desde a 1ª parcela do cliente (qualquer uma, até futura).',
      '- Nota de cada indicador = interpolação linear entre "nota 0" e "nota 100", presa entre 0 e 100 (funciona para escala crescente ou decrescente). **Score = Σ nota × peso ÷ 100** (pesos somam 100).',
      `- Classificação, nesta ordem: (1) **regra dura** — qualquer parcela em aberto vencida há MAIS de ${P.dias_vencidos_regua_cobranca ?? 'N'} dias (estritamente maior; não depende da janela) → **Mau pagador**, sem olhar o score; (2) menos de ${P.minimo_parcelas ?? 'N'} parcelas vencidas na janela → **Novo cliente** (sem score); (3) score ≥ ${P.corte_bom_pagador ?? 'N'} → **Bom**, ≥ ${P.corte_pagador_duvidoso ?? 'N'} → **Duvidoso**, abaixo → **Mau**.`,
      `- **Trava de subida**: piorar é imediato; **melhorar** (Mau→Duvidoso→Bom) só acontece se as últimas ${P.trava_subida_parcelas ?? 'N'} parcelas vencidas seguidas estiverem em dia (contadas da mais recente para trás, a sequência zera no primeiro atraso). Senão o cliente fica no cluster anterior e o histórico marca "subiu bloqueado por trava". Entrar/sair de Novo cliente nunca é travado.`,
      '- **Renegociação** não apaga histórico: as parcelas originais continuam na conta pelo vencimento original até saírem da janela.',
      `- **Competência** (\`mes_referencia\`): se hoje ≥ dia ${P.dia_recalculo ?? 1} do mês, é o mês atual; senão o anterior. Há 1 linha de histórico por cliente por competência — recalcular de novo no mesmo mês SOBRESCREVE a linha daquele mês (o "cluster anterior" registrado continua sendo o que vigorava antes).`,
      '- Quando recalcula: botão "Recalcular clusters" (aba Clusters de Clientes) ou a rotina `cobranca_clusters` do Monitor. Entre recálculos o cluster fica parado — mesmo que o cliente pague ou atrase.',
      '',
      '## 3. Clusters e Inadimplência',
      `- 4 clusters de score: **Novo cliente**, **Bom pagador**, **Pagador duvidoso**, **Mau pagador** (cliente sem cluster calculado vale como Novo). A **Inadimplência** não é cluster de cliente: é a **parcela** vencida há mais de ${L ?? 'N'} dias (o parâmetro "dias vencidos para a régua"). Essa parcela vai para a régua de Inadimplência; as demais parcelas do mesmo cliente continuam na régua do cluster dele.`,
      `- O dia da parcela é **D = hoje − vencimento** (negativo antes de vencer). Régua dos 4 clusters: de D-90 até D+${L ?? 'N'}; régua de Inadimplência: de D+${L == null ? 'N+1' : L + 1} até D+365.`,
      '',
      '## 4. Régua de Cobrança — etapas desta empresa',
      'Cada etapa = um dia D±N num cluster, com canais (WhatsApp, e-mail, ligação), um template (para WhatsApp/e-mail), um responsável (usado só no modo "Responsável por etapa"), **Ativa** e **Rotina** (liberada para gerar tarefa). Etapa inativa ou sem dia é ignorada em tudo; ativa mas sem "Rotina" aparece na Gestão das Parcelas mas não gera tarefa. Responsável de etapa: usuário ativo, não Master, com a empresa no cadastro. Template: da biblioteca da aba Comunicação, autorizado para aquele cluster.',
      ...cfg.regua.flatMap((c) => [`- **${c.nome}**: ${c.etapas.length ? '' : 'nenhuma etapa'}`, ...c.etapas.map((e) => `  - ${linhaEtapa(e)}`)]),
      '- **Etapa atual de uma parcela** (Gestão das Parcelas): a de maior dia ≤ D. A última etapa não tem fim — a parcela fica nela até ser quitada. Antes da 1ª etapa, a parcela ainda não está em cobrança ativa.',
      '',
      '## 5. Rotina do dia (aba Rotinas)',
      '- Cada etapa ativa + na Rotina gera **uma tarefa no dia exato vencimento + N** para cada parcela do universo (1 linha por parcela × centro × etapa). Uma parcela só aparece no dia em que ENTRA na etapa, não todos os dias.',
      `- A régua usada é a do cluster que a parcela tem **hoje** (D > ${L ?? 'N'} hoje → Inadimplência; senão o cluster atual do cliente) — ao olhar dias passados ou futuros, a Rotina usa a classificação de hoje.`,
      '- Ordem: etapa mais avançada primeiro, depois pior cluster, depois maior valor; centros com mais títulos primeiro; agrupado Responsável → Centro de Custo → parcela.',
      '- **Status de cada canal**: "feito" se existe um registro daquele canal, naquela parcela, **na data exata da tarefa** (feito por qualquer pessoa, em qualquer tela). "Erro" se a última tentativa de envio naquela data falhou (telefone sem WhatsApp, conexão fora etc.). Senão, pendente. Desmarcar apaga TODOS os registros daquele canal, parcela e data (e os anexos).',
      '- Responsável de cada tarefa: no modo **Responsável por etapa**, o da etapa; na **Distribuição automática**, quem recebeu o cliente na distribuição gravada daquele dia; dia ainda não distribuído (futuro, ou hoje antes da rotina rodar) = previsão pelo dono da carteira (se ele continua atendente e não está pausado); sem dono = "A distribuir".',
      '',
      '## 6. Comunicação: como a mensagem sai',
      `- Tipo de Comunicação desta empresa: **${com.tipo_nome}**. Os 3 tipos: **Comunicação Automática** (WhatsApp/e-mail deveriam sair sozinhos nos horários; na Rotina vira só um status, sem botão); **Visualizar antes de enviar** (o responsável abre a mensagem pronta e clica Enviar — sai pela Z-API/e-mail do Horizon); **Copiar conteúdo** (o responsável copia o texto, baixa o boleto e manda pelo próprio WhatsApp/e-mail; o Horizon só registra).`,
      com.tipo === 'automatica'
        ? '- ⚠️ **ATENÇÃO — Comunicação Automática ainda não envia nada**: não existe hoje nenhuma rotina de disparo agendado no sistema (os horários por cluster são só gravados). Com este tipo, as colunas WhatsApp/E-mail da Rotina ficam "pendente" para sempre e ninguém consegue enviar pela Rotina; só a ligação é tarefa da atendente. Para enviar de verdade, troque para "Visualizar antes de enviar" ou "Copiar conteúdo".'
        : '- Observação: a "Comunicação Automática" ainda não tem rotina de disparo no sistema — se for escolhida, nada sai sozinho.',
      '- Envio de verdade (Visualizar): o template da etapa que a parcela alcançou na data é preenchido com @nome_cliente, @centro_custo, @vencimento (dd/mm/aaaa) e @valor (saldo corrigido em R$); WhatsApp vai pela conexão Z-API do cluster ao telefone principal do cliente (o marcado como principal; senão o 1º cadastrado no Sienge); e-mail pela conexão SMTP do cluster, com o assunto do template (vazio = "Aviso de cobrança"); template com "enviar boleto" baixa o boleto da parcela no Sienge na hora e manda junto (como documento no WhatsApp, anexo boleto.pdf no e-mail). Exige: data dentro da janela de uma etapa já alcançada (do dia da etapa até a véspera da próxima), template na etapa, telefone/e-mail no cadastro e conexão escolhida para o cluster. Falhou → fica gravado como erro daquela data; deu certo → o erro some e o registro é gravado com o texto enviado.',
      `- Horários e conexões por cluster: ${com.por_cluster.map((p) => `${p.nome} ${p.horario} (WhatsApp: ${p.conexao_whatsapp}; e-mail: ${p.conexao_email})`).join(' · ')}.`,
      `- Templates: ${com.templates.length ? com.templates.map((t) => `"${t.nome}" (${t.clusters.join(', ') || 'nenhum cluster'}${t.manda_boleto ? ', com boleto' : ''}; ${t.etapas_usando} etapa(s))`).join(' · ') : 'nenhum'}.`,
      '',
      '## 7. Registros de contato (histórico da parcela)',
      '- Cada parcela tem sua própria história (nunca mistura parcelas do cliente). Registro = observação manual, WhatsApp, e-mail ou ligação, com data, quem fez, texto e anexos (anexo só em observação/ligação). `tipo` manual = feito por alguém (inclusive o envio pelo botão); automatico = reservado ao disparo automático.',
      '- Parcela já paga não aceita registro novo. Observação e ligação aceitam qualquer data (até antes do vencimento); WhatsApp/e-mail só dentro da janela de uma etapa.',
      `- Cada registro mostra como a parcela estava naquela data: futura (antes do vencimento), em atraso (até ${L ?? 'N'} dias) ou inadimplente — com o limite de hoje.`,
      '',
      '## 8. Distribuição da Rotina',
      `- Modo desta empresa: **${dist.modo}**${dist.modo === 'Distribuição automática' ? `; liberação da carteira em ${dist.dias_liberacao_carteira} dias; atendentes: ${dist.atendentes.map((a) => `${a.nome} (desde ${br(a.entrou_em)}${a.pausado_ate ? `, pausada até ${br(a.pausado_ate)}` : ''}, ${a.clientes_na_carteira} na carteira)`).join(', ') || 'nenhum'}; rotina no Monitor: ${typeof automaticaAg === 'object' ? `${automaticaAg.ativo ? 'ATIVA' : 'DESLIGADA'} (${automaticaAg.frequencia} ${automaticaAg.horario}${automaticaAg.ativo && automaticaAg.proxima ? `, próxima ${automaticaAg.proxima}` : ''})` : 'NÃO AGENDADA'}` : ''}.`,
      dist.modo === 'Distribuição automática' && !(typeof automaticaAg === 'object' && automaticaAg.ativo)
        ? '- ⚠️ A distribuição está ligada mas a rotina `cobranca_distribuicao` não está agendada/ativa no Monitor: o dia só é distribuído se alguém clicar. Sem distribuição gravada, a Rotina mostra a previsão pela carteira ou "A distribuir".'
        : '',
      '- **Responsável por etapa**: cada etapa tem o seu responsável. **Distribuição automática**: uma vez por dia (rotina `cobranca_distribuicao` do Monitor, ou o botão), os clientes da Rotina do dia são repartidos entre os atendentes. A unidade é o **cliente** (todas as parcelas dele no dia vão para a mesma pessoa).',
      '- A regra, na ordem: (1) **continuidade** — cliente com dono na carteira continua com ele; (2) os demais são separados por **faixa** = a etapa da parcela mais grave do cliente no dia (Inadimplência antes de tudo, depois mais dias, depois pior cluster), da mais grave para a mais leve; (3) em cada faixa, primeiro **quantos**: cada vaga vai para quem tem menos clientes daquela faixa hoje, empate → menos clientes no total hoje, empate → menor média; (4) depois **quais**: do maior para o menor valor, cada cliente vai para quem ainda tem vaga e está com a **menor média de valor por dia trabalhado no mês** (valor distribuído no mês ÷ dias em que participou + 1); (5) grava; quem recebeu cliente novo vira dono dele na **carteira**.',
      '- **Motivos** gravados: continuidade, novo, liberado (o dono saiu da distribuição), cobertura (o dono está pausado — o cliente é atendido por outro sem sair da carteira dele), transferido (substituição ou repasse).',
      `- **Liberação**: cliente que fica mais de ${dist.dias_liberacao_carteira} dias sem aparecer na Rotina sai da carteira; quando voltar, é cliente novo.`,
      '- **Atendentes**: só usuário ativo, não Master, com a empresa no cadastro. **Pausa** (férias) até uma data: os clientes dele vão como cobertura. **Saída**: a carteira dele fica gravada e os clientes voltam como "liberado" quando aparecerem; o que já foi distribuído a ele no dia só muda com "Redistribuir hoje". **Substituição**: a vaga continua — o novo herda a carteira inteira e o placar do mês; o que o anterior já trabalhou hoje fica com ele, o resto do dia passa para o novo.',
      '- Rodar de novo no mesmo dia é **incremental**: quem já recebeu continua; só clientes novos do dia são distribuídos; cliente que saiu da Rotina (pagou) e não foi trabalhado sai da distribuição do dia. **Redistribuir hoje** refaz o dia com a equipe atual, mas cliente com contato manual registrado hoje nunca muda de dono. **Repassar parte da carteira** (opção do redistribuir): move clientes da maior carteira para a menor até a diferença ser ≤ 1, só os sem contato manual nos últimos 7 dias (os de contato mais antigo primeiro).',
      '- Tudo fica no registro de mudanças (log): ligar/desligar, entrada, saída, pausa, substituição, cada distribuição com o resumo.',
      '',
      '## 9. Gestão das Parcelas',
      `- Base: todas as parcelas do universo (pagas e em aberto), por Centro de Custo → Cliente → Título → Parcela, com o cluster de score do cliente. **Status**: paga **em dia** (saldo 0 e último recebimento até o vencimento — sem tolerância), paga **com atraso** (recebimento depois do vencimento), **inadimplente** (em aberto, D > ${L ?? 'N'}), **a vencer** (todo o resto em aberto — inclusive vencida há até ${L ?? 'N'} dias).`,
      '- Etapa e Responsável só para parcela em aberto: etapa atual na régua do cluster (ou de Inadimplência); responsável = o da etapa (modo por etapa) ou o **dono do cliente na carteira** (distribuição automática). Os filtros Tipo de Parcela e Responsável valem para os 3 níveis.',
      '',
      '## 10. Aba Clientes',
      '- Clientes ativos (com pelo menos 1 parcela em aberto) por centro de custo, com o flag **Comunicar** — desmarcado, o cliente sai de toda a cobrança. O flag sobrevive à atualização do cadastro do Sienge.',
      '',
      '## 11. Relatório Desempenho da Cobrança — regras',
      '- **Tarefa** = cada vez que a parcela entra numa etapa ativa e com Rotina (vencimento + dias), 1 por canal da etapa. Na Comunicação Automática, WhatsApp e e-mail saem "sozinhos": só a **ligação** conta como tarefa da atendente. Conta da 1ª etapa até hoje (ou até o fim do período, ou até a parcela ser quitada).',
      '- **Responsável** de cada tarefa = quem recebeu o cliente na Distribuição automática **gravada naquele dia**; sem distribuição gravada no dia, o responsável da etapa (sem nenhum dos dois, a tarefa fica sem dono).',
      '- **Feita** = registro daquele canal, **pela própria responsável**, entre a data da etapa e a véspera da próxima etapa da parcela (1 registro cumpre 1 tarefa).',
      '- **Pagamento** = só "Recebimento" do Sienge com valor líquido > 0. Reparcelamento, distrato, desconto concedido etc. zeram o saldo sem dinheiro: a parcela não conta como paga e sai de Pagas e Em aberto.',
      '- **Dono** da parcela (abas Pagas/Em aberto) = o responsável da ÚLTIMA tarefa com dono; as interações são as dela.',
      '- Abas: **Parcelas Pagas** = paga com data de pagamento dentro do período (valor = soma dos Recebimentos; dias de atraso no pagamento). **Parcelas em Aberto** = em aberto no fim do período com vencimento dentro do período (valor = o que faltava no fim do período). **Parcelas Distribuídas** = só Distribuição automática, pela data da distribuição: 1 linha por parcela × dia distribuído (a mesma parcela pode aparecer em vários dias), atendente = quem recebeu no dia, interações da etapa daquele dia feitas por ela, valor = saldo no dia, pagamento só se veio depois da distribuição.',
      '- O universo do relatório é o mesmo da Rotina (origem CO, Lançamento, Comunicar, Tipos de Pagamento) e as tarefas do passado são reconstruídas com o **cluster e a régua de hoje**.',
      '',
      '## 12. Fontes de dados e Monitor de Integrações (ordem ideal: clientes → base → clusters → distribuição)',
      ...cfg.monitor.map(
        (r) => `- ${r.nome}: ${r.agendamento}; último sucesso ${r.ultimo_sucesso}${r.ultima_execucao && r.ultima_execucao.status !== 'sucesso' ? ` — ATENÇÃO: a última execução (${r.ultima_execucao.iniciou}) terminou como "${r.ultima_execucao.status}"${r.ultima_execucao.erro ? `: ${r.ultima_execucao.erro}` : ''}` : ''}.`
      ),
      '',
      '## 13. Alertas desta configuração (conferidos agora)',
      ...alertas(cfg).map((a) => `- ⚠️ ${a}`),
      '',
      '## 14. Pontos de atenção conhecidos',
      '- A Rotina, a Gestão das Parcelas e o relatório usam o cluster gravado no último recálculo e a configuração ATUAL da régua: mudar uma etapa muda também como os dias passados aparecem (exceto o dono gravado pela distribuição e os registros, que são fatos).',
      '- Distribuição gravada de dias passados continua valendo no relatório mesmo que o atendente tenha saído da distribuição depois (a limpeza só se faz apagando os dias gravados).',
      `- "Dias vencidos para a régua" é **maior que** ${L ?? 'N'} (não "a partir de"): D+${L ?? 'N'} ainda é do cluster; D+${L == null ? 'N+1' : L + 1} já é Inadimplência / regra dura.`,
      '- Paga "em dia" na Gestão das Parcelas não usa a tolerância do Motor de Risco (só a data do recebimento contra o vencimento); o score usa a tolerância.',
      '',
      '## Qual ferramenta usar',
      '- Configuração completa (parâmetros, etapas, templates com texto, tipos de pagamento, atendentes, Monitor): **cobranca_configuracao**.',
      '- Clusters (quantos clientes e saldos por cluster e por centro, lista de clientes de um cluster, quem mudou de cluster no último recálculo): **cobranca_clusters**.',
      '- Tudo sobre um cliente (por que está no cluster, score com cada indicador, parcelas e status, dono na carteira, dias distribuídos, contatos): **cobranca_cliente**.',
      '- Tudo sobre uma parcela (etapas e datas, dono em cada etapa, o que foi feito e o que faltou, registros, erros de envio, recebimentos): **cobranca_parcela**.',
      '- A Rotina de um dia ou período (tarefas por atendente, feitas/pendentes/erro por canal): **cobranca_rotina**.',
      '- A distribuição (painel de hoje, atendentes, carteiras, média do mês, dia a dia por atendente, por que um cliente foi para alguém, log): **cobranca_distribuicao**.',
      '- O relatório Desempenho da Cobrança (por atendente e aba, interações feitas × devidas, valores): **cobranca_desempenho**.',
      '- Gestão das Parcelas (carteira por centro/cluster/etapa/status/responsável): **cobranca_carteira**.',
      '- "O que aconteceu?" num período (contatos por pessoa e canal, envios que falharam, distribuições e mudanças, recálculos, versões do Motor, alterações de etapas/templates/flags, execuções do Monitor): **cobranca_o_que_aconteceu**.',
      '- Perguntas que nenhuma cobre: **cobranca_descrever_tabelas** e depois **cobranca_consultar_sql**.',
      '',
      'Valores em R$; datas AAAA-MM-DD nas ferramentas. Responda como um gestor de cobrança: mostre a conta, cite a regra e dê exemplos com os dados.'
    );
    return md.filter((l) => l !== '').join('\n').replace(/\n(#+ )/g, '\n\n$1');
  }),
};

module.exports = guia;
