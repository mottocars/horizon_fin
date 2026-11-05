const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const A = require('./anonimizador');
const { Metadados, Mapas, copiarTabela, copiarLinhas, inserirLote } = require('./banco');
const C = require('./config');

// ---------------------------------------------------------------------------------------
// Monta (ou remonta) a empresa modelo HZN CONSTRUTORA a partir de uma cópia anonimizada da
// empresa de origem. SÓ escreve em linhas da empresa modelo (empresa_id = modelo, ou filhas
// delas) e na equipe fictícia; a origem é só LIDA. Tudo dentro do client recebido (uma
// transação aberta por quem chama — se algo falhar, nada muda).
// ---------------------------------------------------------------------------------------

function log(ctx, msg) {
  ctx.log?.(msg);
}

// ─── empresa, equipe e dicionários ──────────────────────────────────────────────────────

// Logomarca padrão da empresa modelo (só entra se a empresa ainda não tiver uma).
function logoPadrao() {
  const arquivo = require('path').join(__dirname, 'logo-hzn.png');
  return `data:image/png;base64,${require('fs').readFileSync(arquivo).toString('base64')}`;
}

async function garantirEmpresaModelo(client) {
  const { rows } = await client.query('SELECT id FROM empresas WHERE empresa_modelo');
  if (rows[0]) {
    await client.query(
      `UPDATE empresas SET razao_social = $2, nome_fantasia = $3, cep = $4, logradouro = $5, numero = $6, complemento = $7,
         bairro = $8, cidade = $9, estado = $10, telefone = $11, situacao_cadastral = $12, data_inicio_atividade = $13,
         logo = COALESCE(logo, $14), atualizado_em = NOW()
       WHERE id = $1`,
      [rows[0].id, C.EMPRESA.razao_social, C.EMPRESA.nome_fantasia, C.EMPRESA.cep, C.EMPRESA.logradouro, C.EMPRESA.numero,
        C.EMPRESA.complemento, C.EMPRESA.bairro, C.EMPRESA.cidade, C.EMPRESA.estado, C.EMPRESA.telefone,
        C.EMPRESA.situacao_cadastral, C.EMPRESA.data_inicio_atividade, logoPadrao()]
    );
    return rows[0].id;
  }
  const e = C.EMPRESA;
  const { rows: novo } = await client.query(
    `INSERT INTO empresas (cnpj, razao_social, nome_fantasia, cep, logradouro, numero, complemento, bairro, cidade, estado,
       telefone, situacao_cadastral, data_inicio_atividade, logo, ativo, empresa_modelo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE,TRUE) RETURNING id`,
    [e.cnpj, e.razao_social, e.nome_fantasia, e.cep, e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.estado,
      e.telefone, e.situacao_cadastral, e.data_inicio_atividade, logoPadrao()]
  );
  return novo[0].id;
}

async function garantirEquipe(client, empresaModelo) {
  const ids = [];
  for (const p of C.EQUIPE) {
    const { rows } = await client.query('SELECT id FROM usuarios WHERE lower(email) = lower($1)', [p.email]);
    let id = rows[0]?.id;
    if (!id) {
      // Senha aleatória que ninguém conhece: a equipe fictícia não entra no sistema.
      const hashSenha = await bcrypt.hash(crypto.randomBytes(24).toString('base64'), 10);
      const { rows: n } = await client.query(
        `INSERT INTO usuarios (nome, email, username, senha_hash, permissao, telas_permitidas, ativo, primeiro_acesso)
         VALUES ($1, $2, $3, $4, 'BASICO', '{}', TRUE, TRUE) RETURNING id`,
        [p.nome, p.email, p.username, hashSenha]
      );
      id = n[0].id;
    }
    // Telefone com DDD 00 (não existe no Brasil): os comunicados simulados da empresa modelo
    // mostram "enviado" sem nenhum número de verdade envolvido.
    await client.query(`UPDATE usuarios SET telefone_ddd = '00', telefone_numero = $2 WHERE id = $1`, [id, `9000000${String(ids.length + 1).padStart(2, '0')}`]);
    ids.push(id);
    await client.query(
      `INSERT INTO usuarios_empresas (usuario_id, empresa_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, empresaModelo]
    );
  }
  return ids;
}

// Dicionários fixos (obras, SPEs, pessoas da equipe da origem, marca) + nomes de pessoas da
// origem para achar nomes soltos em texto livre.
async function prepararDicionarios(ctx) {
  const { client, origem } = ctx;
  A.fixarDocumento(C.CNPJ_ORIGEM, C.EMPRESA.cnpj);

  const subs = [];
  const centros = (await client.query('SELECT sienge_id, name, commercial_name FROM centros_custo_sienge WHERE empresa_id = $1', [origem])).rows;
  ctx.centroNome = new Map();
  for (const c of centros) {
    const novo = C.CENTROS[A.normalizar(c.name)] || `HZN ${A.nomeEmpresa(`centro:${c.sienge_id}`).split(' ')[0]}`;
    ctx.centroNome.set(Number(c.sienge_id), novo);
    for (const n of [c.name, c.commercial_name]) {
      if (!n) continue;
      A.fixarNome(n, novo);
      subs.push([n, novo]);
    }
  }
  for (const [o, f] of Object.entries(C.EMPRESAS_GRUPO)) {
    A.fixarNome(o, f);
    subs.push([o, f]);
  }
  // Abreviações das SPEs no Portal Caixa ("TOSTES 03 EMPREENDIMENTOS I S LTDA") e nomes soltos.
  const spe = { '01': 'ORIENTE', '02': 'PANORAMA', '03': 'POENTE', '04': 'ALVORADA', '05': 'NASCENTE', '06': 'LINHA DO HORIZONTE', '07': 'CREPÚSCULO' };
  for (const [n, o] of Object.entries(spe)) {
    subs.push([`TOSTES ${n} EMPREENDIMENTOS I S LTDA`, `HZN ${o} EMPREENDIMENTOS SPE LTDA`]);
    subs.push([`TOSTE ${n}`, `HZN ${o}`]);
    subs.push([`TOSTES ${n}`, `HZN ${o}`]);
  }
  subs.push(['TOSTES E DINIZ CONSTR E LOC DE EQUIP', 'HZN CONSTRUTORA E INCORPORADORA']);
  // razão social da origem truncada (certificados, cadastros antigos)
  for (const corte of ['EQUIPAMENTOS LTDA', 'EQUIPAMENTOS', 'EQUIPAMEN', 'EQUIPAME', 'EQUIPAM', 'EQUIPA', 'EQUIP']) {
    subs.push([`TOSTES E DINIZ CONSTRUCOES E LOCACAO DE ${corte}`, 'HZN CONSTRUTORA E INCORPORADORA LTDA']);
  }
  subs.push(['CONSTRUCOES E LOCACAO DE EQUIPAMENTOS', 'CONSTRUTORA E INCORPORADORA']);
  subs.push(['TOSTES E DINIZ', 'HZN CONSTRUTORA']);
  subs.push(['TOSTE E DINIZ', 'HZN CONSTRUTORA']);
  subs.push(['Contato | Tostes e Diniz', 'Contato | HZN Construtora']);
  subs.push(['RESIDENCIAL TOSTES', 'RESIDENCIAL HZN']);
  subs.push([C.TENANT_ORIGEM_PLACEHOLDER || 'tostesediniz', C.TENANT]);
  subs.push(['VR4 CONSTRUÇÃO E INCORPORAÇÃO SPE LTDA', C.EMPRESAS_GRUPO['VR4 CONSTRUCAO E INCORPORACAO SPE LTDA']]);
  subs.push(['VR3 CONST E INCORP SPE LTDA', C.EMPRESAS_GRUPO['VR3 CONST E INCORP SPE LTDA']]);
  subs.push(['JARDIM AMALIA', 'JARDIM VISTA ALEGRE']);
  subs.push(['JD AMALIA', 'JD VISTA ALEGRE']);
  subs.push(['JOAQUIM LEITE', 'ZÊNITE']);
  subs.push(['T&D', 'HZN']);
  // nomes curtos de obra que são distintivos o bastante para trocar em qualquer texto
  subs.push(['NORMAND', 'MIRANTE']);
  subs.push(['VOLDAC', 'ALTITUDE']);
  subs.push(['VR4', 'HZN ZÊNITE']);
  subs.push(['VR3', 'HZN MIRANTE']);

  // Pessoas da origem conhecidas pelo login (Sienge) e quem lançou títulos.
  const pessoas = (
    await client.query(
      `SELECT DISTINCT registered_by AS nome, registered_user_id AS login FROM sie_outcome WHERE empresa_id = $1 AND registered_by IS NOT NULL`,
      [origem]
    )
  ).rows;
  ctx.loginSienge = new Map();
  for (const p of pessoas) {
    if (/tostes|diniz/i.test(p.nome) && /contato/i.test(p.nome)) continue;
    const novo = A.nome(p.nome, { tipo: 'PF' });
    A.fixarNome(p.nome, novo);
    subs.push([p.nome, novo]);
    if (p.login) ctx.loginSienge.set(p.login, A.normalizar(novo).replace(/[^A-Z]/g, ''));
  }
  // Sócios/família da origem que aparecem soltos em históricos ("PRO LABORE ADRIANA TOSTES").
  for (const n of ['RODRIGO TOSTES', 'ADRIANA TOSTES', 'ARIANA TOSTES', 'ARIANA', 'ARIANATOSTES', 'THAISVALENTE', 'THAISALVES']) {
    const novo = A.nome(n, { tipo: 'PF' });
    subs.push([n, /^[A-Z]+$/.test(n) && n.length > 10 ? A.normalizar(novo).replace(/[^A-Z]/g, '') : novo]);
  }
  subs.push(['TOSTES', 'HZN']);
  subs.push(['TOSTE', 'HZN']);
  subs.push(['DINIZ', 'HORIZONTE']);
  A.definirSubstituicoes(subs);

  // Primeiros nomes / sobrenomes de todas as pessoas da origem — para achar nomes soltos em
  // texto livre (históricos de extrato, observações).
  const { rows: nomes } = await client.query(
    `SELECT name AS n FROM sie_customers WHERE empresa_id = $1 AND person_type = 'Física'
     UNION SELECT name FROM sie_customers_spouse WHERE empresa_id = $1
     UNION SELECT nome_mutuario FROM extrato_unidades WHERE empresa_id = $1
     UNION SELECT creditor_name FROM sie_outcome WHERE empresa_id = $1 AND creditor_name ~ '^[0-9]{2}\.?[0-9]{3}\.?[0-9]{3} '
     UNION SELECT registered_by FROM sie_outcome WHERE empresa_id = $1`,
    [origem]
  );
  // Vocabulário comum (plano de contas, documentos, centros, históricos do Sienge): palavras
  // que nunca contam como nome de pessoa, mesmo que algum cadastro comece com elas.
  const { rows: vocab } = await client.query(
    `SELECT name AS t FROM planos_financeiros_sienge WHERE empresa_id = $1
     UNION SELECT document_identification_name FROM sie_outcome WHERE empresa_id = $1
     UNION SELECT name FROM centros_custo_sienge WHERE empresa_id = $1
     UNION SELECT statement_type FROM sie_extrato_contas WHERE empresa_id = $1
     UNION SELECT cost_estimation_sheet_name FROM sie_outcome_obras WHERE empresa_id = $1`,
    [origem]
  );
  const comuns = new Set();
  for (const { t } of vocab) for (const w of A.normalizar(t).split(/[^A-Z]+/)) if (w.length >= 3) comuns.add(w);
  for (const w of `CENTRO CENTROS CUSTO CASA LOJA POSTO AUTO MERCADO COMERCIAL DEPOSITO PADARIA FARMACIA DROGARIA
    RESTAURANTE HOTEL CLINICA ESCRITORIO OBRA OBRAS CONTA CONTAS TITULO TITULOS NOTA NOTAS PARCELA PARCELAS VALOR
    SALDO PAGAMENTO PAGO PAGA RECEBIMENTO REEMBOLSO RETIRADO RETIRADA APORTE TAXA TARIFA JUROS MULTA DESCONTO
    NOVO NOVA BOM BOA SAO SANTA SANTO VILA JARDIM PARQUE RUA AVENIDA CONDOMINIO RESIDENCIAL EDIFICIO UNIDADE`.split(/\s+/)) comuns.add(w);
  const prenomes = new Set(['ARIANA', 'ADRIANA', 'RODRIGO', 'THAIS']);
  const sobrenomes = new Set();
  for (const { n } of nomes) {
    const partes = A.normalizar(String(n || '').replace(/^\d[\d.]*\s+/, '')).split(' ').filter(Boolean);
    if (partes.length < 2 || A.ehPessoaJuridica(n)) continue;
    if (partes[0].length >= 3) prenomes.add(partes[0]);
    for (const p of partes.slice(1)) if (p.length >= 3 && !['DOS', 'DAS'].includes(p)) sobrenomes.add(p);
  }
  // palavras comuns que também são nomes próprios não contam como início de nome
  for (const p of ['DOS', 'DAS', 'DE', 'DA', 'DO', 'SAO', 'SANTA', 'PAGO', 'PELO', 'PELA', 'VALOR', 'SOMA', 'CAIXA']) prenomes.delete(p);
  for (const p of comuns) {
    prenomes.delete(p);
    sobrenomes.delete(p);
  }
  for (const p of ['ARIANA', 'ADRIANA', 'RODRIGO', 'THAIS']) prenomes.add(p);
  ctx.prenomes = prenomes;
  ctx.sobrenomes = sobrenomes;
}

// Texto livre: dicionário + nomes de pessoas soltos ("RETIRADO PELA ARIANA", "IGOR FERNANDO … LTDA").
function textoLivre(ctx, valor) {
  if (!valor || typeof valor !== 'string') return valor;
  let t = A.texto(valor);
  t = t.replace(/[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)*/g, (corrida) => {
    const palavras = corrida.split(/\s+/);
    const saida = [];
    for (let i = 0; i < palavras.length; ) {
      const p = A.normalizar(palavras[i]);
      if (ctx.prenomes.has(p)) {
        let j = i + 1;
        while (j < palavras.length) {
          const q = A.normalizar(palavras[j]);
          if (ctx.sobrenomes.has(q) || (['DE', 'DA', 'DO', 'DOS', 'DAS'].includes(q) && j + 1 < palavras.length && ctx.sobrenomes.has(A.normalizar(palavras[j + 1])))) j += 1;
          else break;
        }
        const original = palavras.slice(i, j).join(' ');
        const novo = j - i === 1 ? A.nome(original, { tipo: 'PF' }).split(' ')[0] : A.nome(original, { tipo: 'PF' });
        saida.push(A.aplicarCaixa(original, novo));
        i = j;
      } else {
        saida.push(palavras[i]);
        i += 1;
      }
    }
    return saida.join(' ');
  });
  return t;
}

// Nome de obra solto (conta bancária, orçamento, Caixa): dicionário de nomes curtos.
function nomeObra(valor) {
  if (!valor) return valor;
  let t = A.texto(valor);
  const n = A.normalizar(t);
  const chaves = Object.keys(C.OBRAS_CURTAS).sort((a, b) => b.length - a.length);
  for (const k of chaves) {
    const re = new RegExp(`(^|[^A-Z0-9])${k.replace(/ /g, '\\s+')}(?=$|[^A-Z0-9])`, 'i');
    if (re.test(A.normalizar(t)) && re.test(n)) {
      t = A.normalizar(t).replace(new RegExp(`(^|[^A-Z0-9])${k.replace(/ /g, '\\s+')}(?=$|[^A-Z0-9])`, 'g'), (m, a) => a + C.OBRAS_CURTAS[k]);
    }
  }
  return A.aplicarCaixa(valor, t);
}

function nomeCentro(ctx, siengeId, original) {
  return ctx.centroNome.get(Number(siengeId)) || A.texto(original);
}
function nomeEmpresaGrupo(valor) {
  if (!valor) return valor;
  const fixo = C.EMPRESAS_GRUPO[A.normalizar(valor)];
  return fixo ? A.aplicarCaixa(valor, fixo) : A.texto(valor);
}

// ─── limpeza (só a empresa modelo) ─────────────────────────────────────────────────────

async function limparEmpresaModelo(ctx) {
  const { client, meta, modelo } = ctx;
  // Trava: só limpa a empresa marcada como modelo.
  const { rows } = await client.query('SELECT empresa_modelo FROM empresas WHERE id = $1', [modelo]);
  if (!rows[0]?.empresa_modelo) throw new Error(`A empresa ${modelo} não é a empresa modelo — limpeza abortada.`);

  // Tabelas com empresa_id, ordenadas para apagar filhas antes das mães (RESTRICT).
  const tabelas = [...meta.colunas.keys()].filter((t) => meta.temColuna(t, 'empresa_id') && t !== 'empresas');
  const dependeDe = new Map(tabelas.map((t) => [t, new Set(meta.fksDe(t).map((f) => f.tabelaRef).filter((r) => r !== t && tabelas.includes(r)))]));
  const ordem = [];
  const feitas = new Set();
  // filhas primeiro: uma tabela só sai depois de todas as que dependem dela
  const dependentes = new Map(tabelas.map((t) => [t, tabelas.filter((o) => dependeDe.get(o).has(t))]));
  const visitar = (t, pilha = new Set()) => {
    if (feitas.has(t) || pilha.has(t)) return;
    pilha.add(t);
    for (const d of dependentes.get(t)) visitar(d, pilha);
    feitas.add(t);
    ordem.push(t);
  };
  tabelas.forEach((t) => visitar(t));

  // Tabelas sem empresa_id que guardam dado da modelo por um pai.
  await client.query(`DELETE FROM sienge_credores_cache WHERE tenant = $1`, [C.TENANT]);
  await client.query(`DELETE FROM espiao_notas_eventos WHERE nota_id IN (SELECT id FROM espiao_notas WHERE empresa_id = $1)`, [modelo]);
  await client.query(
    `DELETE FROM integracoes_vanpix_convenios WHERE integracao_id IN (SELECT id FROM integracoes_vanpix WHERE empresa_id = $1)`,
    [modelo]
  );
  if (meta.existe('saldos_rotinas_encerramentos')) {
    await client.query(`DELETE FROM saldos_rotinas_encerramentos WHERE periodo_id IN (SELECT id FROM saldos_periodos WHERE empresa_id = $1)`, [modelo]).catch(() => {});
  }
  for (const t of ordem) {
    if (t === 'usuarios_empresas') continue; // a equipe fictícia continua ligada
    await client.query(`DELETE FROM "${t}" WHERE empresa_id = $1`, [modelo]);
  }
}

// ─── cópia ────────────────────────────────────────────────────────────────────────────

const W = 'empresa_id = $1';

async function copiar(ctx, tabela, opcoes = {}) {
  const r = await copiarTabela(ctx, tabela, opcoes.where || W, opcoes.params || [ctx.origem], opcoes);
  log(ctx, `  ${tabela}: ${r.quantidade}`);
  return r;
}

// Regra padrão de texto: toda coluna de texto passa pelo dicionário (marca/obras/SPEs/pessoas
// da origem) — as regras específicas de cada tabela vêm por cima.
// Códigos que ligam tabelas sem FK declarada (contas, contratos, documentos do Sienge).
const COLUNAS_CODIGO = /^(numero_conta|account_number|contrato_empreendimento|numero_contrato|numero_contrato_unidade|document_id|document_identification_id|financial_category_id|natureza_id|natureza_original|origem|origem_projecao|fonte|tipo|status|rotina|chave|apelido|codigo_\w+|cost_estimation_sheet_id|statement_origin|origin_id|type|situacao_categoria)$/;

function textosPadrao(ctx, tabela, linha) {
  for (const col of ctx.meta.colunasDe(tabela)) {
    const v = linha[col.nome];
    if (v === null || v === undefined) continue;
    if (ctx.meta.ehChave(tabela, col.nome) || COLUNAS_CODIGO.test(col.nome)) continue;
    if (col.udt === 'varchar' || col.udt === 'text' || col.udt === 'bpchar') linha[col.nome] = A.texto(v);
    else if (col.udt === 'jsonb' || col.udt === 'json') linha[col.nome] = A.json(v);
  }
  return linha;
}

function comPadrao(ctx, tabela, especifico) {
  return (linha, original) => {
    textosPadrao(ctx, tabela, linha);
    return especifico ? especifico(linha, original) : linha;
  };
}

async function copiarCadastros(ctx) {
  const { origem } = ctx;
  log(ctx, 'Cadastros');
  await copiar(ctx, 'mascara_itens', { transformar: comPadrao(ctx, 'mascara_itens') });
  await copiar(ctx, 'classificacoes_bancarias', { transformar: comPadrao(ctx, 'classificacoes_bancarias') });
  await copiar(ctx, 'dre_mascaras', { transformar: comPadrao(ctx, 'dre_mascaras') });
  await copiar(ctx, 'dre_mascaras_imposto_historico', {
    where: 'mascara_id IN (SELECT id FROM dre_mascaras WHERE empresa_id = $1)',
  });
  await copiar(ctx, 'dfc_mascaras', { transformar: comPadrao(ctx, 'dfc_mascaras') });
  await copiar(ctx, 'dre_categorias_orcamento', { transformar: comPadrao(ctx, 'dre_categorias_orcamento') });

  await copiar(ctx, 'centros_custo_sienge', {
    transformar: comPadrao(ctx, 'centros_custo_sienge', (l, o) => {
      l.name = nomeCentro(ctx, o.sienge_id, o.name);
      l.commercial_name = nomeCentro(ctx, o.sienge_id, o.commercial_name);
      l.apelido = o.apelido ? nomeCentro(ctx, o.sienge_id, o.apelido) : null;
      l.cnpj = A.documento(o.cnpj);
      l.company_name = nomeEmpresaGrupo(o.company_name);
      l.endereco = o.endereco
        ? o.endereco
            .split(' - ')
            .map((p, i) => (i === 0 ? A.logradouro(p) : i === 1 ? A.numeroEndereco(p) : A.texto(p)))
            .join(' - ')
        : o.endereco;
      l.cep = A.cep(o.cep);
      l.criado_por = o.criado_por ? ctx.loginSienge.get(o.criado_por) || 'CAMILAPRADO' : o.criado_por;
      l.modificado_por = o.modificado_por ? ctx.loginSienge.get(o.modificado_por) || 'RAFAELDUARTE' : o.modificado_por;
      l.enterprise_observation = textoLivre(ctx, o.enterprise_observation);
      return l;
    }),
  });
  await copiar(ctx, 'centro_custo_etapas_historico');
  await copiar(ctx, 'planos_financeiros_sienge', { transformar: comPadrao(ctx, 'planos_financeiros_sienge') });
  await copiar(ctx, 'contas_bancarias_sienge', {
    transformar: comPadrao(ctx, 'contas_bancarias_sienge', (l, o) => {
      l.nome = nomeObra(o.nome);
      l.company_name = nomeEmpresaGrupo(o.company_name);
      return l;
    }),
  });
}

async function copiarClientes(ctx) {
  log(ctx, 'Clientes (Sienge)');
  ctx.clienteNome = new Map();
  await copiar(ctx, 'sie_customers', {
    transformar: comPadrao(ctx, 'sie_customers', (l, o) => {
      const pj = o.person_type === 'Jurídica';
      const doc = pj ? o.cnpj : o.cpf;
      l.name = A.nome(o.name, { doc, tipo: pj ? 'PJ' : 'PF' });
      ctx.clienteNome.set(String(o.id), l.name);
      l.social_name = o.social_name ? l.name : o.social_name;
      l.fantasy_name = o.fantasy_name ? A.nome(o.fantasy_name, { doc: `fant:${doc}`, tipo: 'PJ' }) : o.fantasy_name;
      l.email = A.email(o.email, l.name);
      l.cpf = A.documento(o.cpf);
      l.cnpj = A.documento(o.cnpj);
      l.father_name = o.father_name ? A.nome(o.father_name, { tipo: 'PF' }) : o.father_name;
      l.mother_name = o.mother_name ? A.nome(o.mother_name, { tipo: 'PF' }) : o.mother_name;
      l.contact_name = o.contact_name ? A.nome(o.contact_name, { tipo: 'PF' }) : o.contact_name;
      l.technical_manager = o.technical_manager ? A.nome(o.technical_manager, { tipo: 'PF' }) : o.technical_manager;
      for (const c of ['number_identity_card', 'license_number', 'international_id', 'state_registration_number', 'city_registration_number', 'crea_number']) l[c] = A.numero(o[c]);
      l.note = textoLivre(ctx, o.note);
      l.site = null;
      return l;
    }),
  });
  const filhos = 'empresa_id = $1';
  await copiar(ctx, 'sie_customers_addresses', {
    where: filhos,
    transformar: comPadrao(ctx, 'sie_customers_addresses', (l, o) => {
      l.street_name = A.logradouro(o.street_name);
      l.number = A.numeroEndereco(o.number);
      l.complement = o.complement && /\d/.test(o.complement) ? A.numero(o.complement) : o.complement;
      l.zip_code = A.cep(o.zip_code);
      return l;
    }),
  });
  await copiar(ctx, 'sie_customers_phones', {
    where: filhos,
    transformar: comPadrao(ctx, 'sie_customers_phones', (l, o) => {
      l.number = A.telefone(o.number);
      l.note = textoLivre(ctx, o.note);
      return l;
    }),
  });
  await copiar(ctx, 'sie_customers_spouse', {
    where: filhos,
    transformar: comPadrao(ctx, 'sie_customers_spouse', (l, o) => {
      l.name = A.nome(o.name, { doc: o.cpf, tipo: 'PF' });
      l.cpf = A.documento(o.cpf);
      l.email = A.email(o.email, l.name);
      l.father_name = o.father_name ? A.nome(o.father_name, { tipo: 'PF' }) : o.father_name;
      l.mother_name = o.mother_name ? A.nome(o.mother_name, { tipo: 'PF' }) : o.mother_name;
      l.cellphone_number = A.telefone(o.cellphone_number);
      l.business_phone = A.telefone(o.business_phone);
      l.company = o.company ? A.nome(o.company, { tipo: 'PJ' }) : o.company;
      l.number_identity_card = A.numero(o.number_identity_card);
      l.international_id = A.numero(o.international_id);
      l.endereco_street_name = A.logradouro(o.endereco_street_name);
      l.endereco_number = A.numeroEndereco(o.endereco_number);
      l.endereco_zip_code = A.cep(o.endereco_zip_code);
      return l;
    }),
  });
  for (const t of ['sie_customers_agents', 'sie_customers_family_income', 'sie_customers_sub_types']) {
    if (ctx.meta.existe(t)) await copiar(ctx, t, { where: filhos, transformar: comPadrao(ctx, t) });
  }
  if (ctx.meta.existe('sie_customers_procurators')) {
    await copiar(ctx, 'sie_customers_procurators', {
      where: filhos,
      transformar: comPadrao(ctx, 'sie_customers_procurators', (l, o) => {
        for (const [k, v] of Object.entries(o)) {
          if (v === null || typeof v !== 'string') continue;
          if (/(^|_)name$/.test(k)) l[k] = A.nome(v, { tipo: 'PF' });
          else if (/cpf|cnpj/.test(k)) l[k] = A.documento(v);
          else if (/email/.test(k)) l[k] = A.email(v);
          else if (/phone/.test(k)) l[k] = A.telefone(v);
        }
        return l;
      }),
    });
  }
}

async function copiarCredores(ctx) {
  // Cache de credores do Sienge (nome + CPF/CNPJ) — base dos nomes dos fornecedores.
  const { rows: tenant } = await ctx.client.query('SELECT tenant FROM integracoes_sienge WHERE empresa_id = $1 LIMIT 1', [ctx.origem]);
  ctx.credorDoc = new Map();
  ctx.credorNome = new Map();
  if (!tenant[0]) return;
  const { rows } = await ctx.client.query('SELECT * FROM sienge_credores_cache WHERE tenant = $1', [tenant[0].tenant]);
  const linhas = rows.map((r) => {
    const nome = A.nome(r.nome, { doc: r.documento });
    ctx.credorDoc.set(String(r.credor_id), r.documento);
    ctx.credorNome.set(String(r.credor_id), nome);
    return { ...r, tenant: C.TENANT, nome, documento: A.documento(r.documento), atualizado_em: new Date() };
  });
  const n = await inserirLote(ctx.client, ctx.meta, 'sienge_credores_cache', linhas);
  log(ctx, `  sienge_credores_cache: ${n}`);
}

async function copiarFinanceiro(ctx) {
  const { origem } = ctx;
  log(ctx, 'Contas a receber');
  const cliente = (id, nomeOriginal) => ctx.clienteNome.get(String(id)) || A.nome(nomeOriginal);
  const grupo = (l, o) => {
    l.company_name = nomeEmpresaGrupo(o.company_name);
    l.holding_name = nomeEmpresaGrupo(o.holding_name);
    l.subsidiary_name = nomeEmpresaGrupo(o.subsidiary_name);
    l.group_company_name = nomeEmpresaGrupo(o.group_company_name);
    l.project_name = o.project_name ? nomeCentro(ctx, o.project_id, o.project_name) : o.project_name;
    return l;
  };
  await copiar(ctx, 'sie_income', {
    transformar: comPadrao(ctx, 'sie_income', (l, o) => {
      grupo(l, o);
      l.client_name = cliente(o.client_id, o.client_name);
      l.document_number = textoLivre(ctx, o.document_number);
      return l;
    }),
  });
  const categoria = (t) =>
    comPadrao(ctx, t, (l, o) => {
      if ('cost_center_name' in o) l.cost_center_name = nomeCentro(ctx, o.cost_center_id, o.cost_center_name);
      if ('project_name' in o && o.project_name) l.project_name = nomeCentro(ctx, o.project_id, o.project_name);
      return l;
    });
  await copiar(ctx, 'sie_income_categorias', { transformar: categoria('sie_income_categorias') });
  await copiar(ctx, 'sie_income_recebimentos', { transformar: comPadrao(ctx, 'sie_income_recebimentos') });
  await copiar(ctx, 'sie_income_recebimentos_movimentos', {
    where: 'recebimento_id IN (SELECT id FROM sie_income_recebimentos WHERE empresa_id = $1)',
    transformar: comPadrao(ctx, 'sie_income_recebimentos_movimentos'),
  });
  await copiar(ctx, 'sie_income_recebimentos_movimentos_categorias', {
    where: `movimento_id IN (SELECT m.id FROM sie_income_recebimentos_movimentos m
            JOIN sie_income_recebimentos r ON r.id = m.recebimento_id WHERE r.empresa_id = $1)`,
    transformar: categoria('sie_income_recebimentos_movimentos_categorias'),
  });

  log(ctx, 'Contas a pagar');
  await copiar(ctx, 'sie_outcome', {
    transformar: comPadrao(ctx, 'sie_outcome', (l, o) => {
      grupo(l, o);
      l.creditor_name = ctx.credorNome.get(String(o.creditor_id)) || A.nome(o.creditor_name, { doc: ctx.credorDoc.get(String(o.creditor_id)) });
      l.registered_by = o.registered_by ? A.texto(o.registered_by) : o.registered_by;
      l.document_number = textoLivre(ctx, o.document_number);
      l.registered_user_id = o.registered_user_id ? ctx.loginSienge.get(o.registered_user_id) || 'CAMILAPRADO' : o.registered_user_id;
      l.forecast_document = o.forecast_document;
      return l;
    }),
  });
  await copiar(ctx, 'sie_outcome_categorias', { transformar: categoria('sie_outcome_categorias') });
  await copiar(ctx, 'sie_outcome_obras', {
    transformar: comPadrao(ctx, 'sie_outcome_obras', (l, o) => {
      l.building_name = nomeCentro(ctx, o.building_id, o.building_name);
      return l;
    }),
  });
  for (const t of ['sie_outcome_departamentos', 'sie_outcome_autorizacoes']) {
    if (ctx.meta.existe(t)) await copiar(ctx, t, { transformar: comPadrao(ctx, t) });
  }
  await copiar(ctx, 'sie_outcome_pagamentos', {
    transformar: comPadrao(ctx, 'sie_outcome_pagamentos', (l, o) => {
      l.payment_authentication = A.numero(o.payment_authentication);
      return l;
    }),
  });
  await copiar(ctx, 'sie_outcome_pagamentos_movimentos', {
    where: 'pagamento_id IN (SELECT id FROM sie_outcome_pagamentos WHERE empresa_id = $1)',
    transformar: comPadrao(ctx, 'sie_outcome_pagamentos_movimentos'),
  });
  await copiar(ctx, 'sie_outcome_pagamentos_movimentos_categorias', {
    where: `movimento_id IN (SELECT m.id FROM sie_outcome_pagamentos_movimentos m
            JOIN sie_outcome_pagamentos p ON p.id = m.pagamento_id WHERE p.empresa_id = $1)`,
    transformar: categoria('sie_outcome_pagamentos_movimentos_categorias'),
  });

  log(ctx, 'Extrato das contas (Sienge)');
  // Histórico: lançamento com título = nome do credor/cliente; manual = texto livre.
  const { rows: tit } = await ctx.client.query(
    `SELECT DISTINCT 'CP' AS o, bill_id, creditor_id AS pessoa FROM sie_outcome WHERE empresa_id = $1
     UNION ALL SELECT DISTINCT 'CR', bill_id, client_id FROM sie_income WHERE empresa_id = $1`,
    [origem]
  );
  const pessoaDoTitulo = new Map(tit.map((t) => [`${t.o}:${t.bill_id}`, t.pessoa]));
  await copiar(ctx, 'sie_extrato_contas', {
    idSerial: 'registro_id',
    transformar: comPadrao(ctx, 'sie_extrato_contas', (l, o) => {
      const pessoa = o.bill_id ? pessoaDoTitulo.get(`${o.statement_origin}:${o.bill_id}`) : null;
      if (pessoa && o.statement_origin === 'CP') l.description = ctx.credorNome.get(String(pessoa)) || A.nome(o.description);
      else if (pessoa && o.statement_origin === 'CR') l.description = cliente(pessoa, o.description);
      else if (['CP', 'CR'].includes(o.statement_origin) && o.description && !/\d{2}\/\d{2}/.test(o.description)) l.description = A.nome(o.description);
      else l.description = textoLivre(ctx, o.description);
      l.document_number = textoLivre(ctx, o.document_number);
      l.budget_categories = A.json(o.budget_categories);
      return l;
    }),
  });
  await copiar(ctx, 'sie_extrato_contas_rateio', { transformar: comPadrao(ctx, 'sie_extrato_contas_rateio') });
  await copiar(ctx, 'sie_extrato_contas_sincronizacoes');

  log(ctx, 'Orçamento empresarial (Sienge)');
  await copiar(ctx, 'sie_business_budget', {
    idSerial: 'registro_id',
    transformar: comPadrao(ctx, 'sie_business_budget', (l, o) => {
      l.description = nomeObra(o.description);
      l.company_name = nomeEmpresaGrupo(o.company_name);
      l.cost_center_name = nomeCentro(ctx, o.cost_center_id, o.cost_center_name);
      return l;
    }),
  });
  await copiar(ctx, 'sie_business_budget_categorias', {
    idSerial: 'categoria_id',
    where: 'registro_id IN (SELECT registro_id FROM sie_business_budget WHERE empresa_id = $1)',
    transformar: comPadrao(ctx, 'sie_business_budget_categorias'),
  });
  await copiar(ctx, 'sie_business_budget_valores', {
    idSerial: 'valor_id',
    where: `categoria_id IN (SELECT c.categoria_id FROM sie_business_budget_categorias c
            JOIN sie_business_budget b ON b.registro_id = c.registro_id WHERE b.empresa_id = $1)`,
  });
}

async function copiarVendas(ctx) {
  log(ctx, 'Unidades e contratos (Sienge)');
  const cliente = (id, nomeOriginal) => ctx.clienteNome.get(String(id)) || A.nome(nomeOriginal);
  await copiar(ctx, 'sie_units', {
    transformar: comPadrao(ctx, 'sie_units', (l, o) => {
      l.note = o.note ? textoLivre(ctx, o.note).replace(/^[A-ZÀ-Ú ]{8,}\s+-\s+/, 'PERMUTA - ') : o.note;
      l.address_street_name = A.logradouro(o.address_street_name);
      l.address_number = A.numeroEndereco(o.address_number);
      l.address_zip_code = A.cep(o.address_zip_code);
      l.real_estate_registration = A.numero(o.real_estate_registration);
      l.legal_registration_number = A.numero(o.legal_registration_number);
      l.iptu_value = o.iptu_value;
      return l;
    }),
  });
  await copiar(ctx, 'sie_sales_contracts', {
    transformar: comPadrao(ctx, 'sie_sales_contracts', (l, o) => {
      l.company_name = nomeEmpresaGrupo(o.company_name);
      l.enterprise_name = nomeCentro(ctx, o.enterprise_id, o.enterprise_name);
      // financial_institution_number fica igual: liga o contrato à unidade do extrato Caixa (Repasses)
      l.cancellation_reason = textoLivre(ctx, o.cancellation_reason);
      return l;
    }),
  });
  await copiar(ctx, 'sie_sales_contracts_customers', {
    transformar: comPadrao(ctx, 'sie_sales_contracts_customers', (l, o) => {
      l.name = cliente(o.customer_id, o.name);
      return l;
    }),
  });
  await copiar(ctx, 'sie_sales_contracts_units');
}

async function copiarPlanejamento(ctx) {
  log(ctx, 'DFC');
  for (const t of ['dfc_plano_contas', 'dfc_plano_contas_versoes', 'dfc_plano_contas_centro', 'dfc_parametros_versoes', 'dfc_orcamento_versoes']) {
    await copiar(ctx, t, { transformar: comPadrao(ctx, t) });
  }
  await copiar(ctx, 'dfc_orcamento_valores');
  await copiar(ctx, 'dfc_orcamento_log', { transformar: comPadrao(ctx, 'dfc_orcamento_log') });
  for (const t of ['dfc_orcamento_informado', 'dfc_projecao_cef', 'dfc_projecao_cef_execucao', 'dfc_desembolso_fichas', 'dfc_avanco_manual', 'dfc_repasses_registro_manual']) {
    if (ctx.meta.existe(t)) await copiar(ctx, t, { transformar: comPadrao(ctx, t) });
  }

  log(ctx, 'Portal das Construtoras (Caixa)');
  await copiar(ctx, 'dcd_contratos', {
    transformar: comPadrao(ctx, 'dcd_contratos', (l, o) => {
      l.nome_empreendimento = nomeObra(o.nome_empreendimento);
      l.arquivo_original = `${o.numero_contrato}_DEMONST_CRONOGRAMA.PDF`;
      l.arquivo_armazenado = null;
      for (const c of Object.keys(o)) if (/^apolice_/.test(c)) l[c] = A.numero(o[c]);
      return l;
    }),
  });
  for (const t of ['dcd_cronograma_fisico_financeiro', 'dcd_cronograma_liberacao']) await copiar(ctx, t, { transformar: comPadrao(ctx, t) });
  await copiar(ctx, 'extrato_empreendimentos', {
    transformar: comPadrao(ctx, 'extrato_empreendimentos', (l, o) => {
      l.nome_empreendimento = nomeObra(o.nome_empreendimento);
      l.entidade_organizadora = A.texto(o.entidade_organizadora);
      l.cnpj_entidade_organizadora = A.documento(o.cnpj_entidade_organizadora);
      l.arquivo_original = 'empreendimentos_hzn.xls';
      l.arquivo_armazenado = null;
      return l;
    }),
  });
  await copiar(ctx, 'extrato_unidades', {
    transformar: comPadrao(ctx, 'extrato_unidades', (l, o) => {
      l.nome_mutuario = A.nome(o.nome_mutuario, { doc: o.cpf_cnpj_mutuario });
      l.cpf_cnpj_mutuario = A.documento(o.cpf_cnpj_mutuario);
      l.numero_contrato_unidade = o.numero_contrato_unidade;
      return l;
    }),
  });
  for (const t of ['extrato_cronograma', 'extrato_proximos_eventos']) await copiar(ctx, t, { transformar: comPadrao(ctx, t) });

  log(ctx, 'DRE');
  for (const t of ['dre_plano_contas', 'dre_plano_contas_versoes', 'dre_plano_contas_centro', 'dre_orcamento_valores', 'dre_configuracoes', 'dre_documentos_excluidos']) {
    if (ctx.meta.existe(t)) await copiar(ctx, t, { transformar: comPadrao(ctx, t) });
  }
  const livre = (t, cols) =>
    comPadrao(ctx, t, (l, o) => {
      for (const c of cols) if (c in o) l[c] = typeof o[c] === 'string' ? textoLivre(ctx, o[c]) : A.json(o[c], (s) => textoLivre(ctx, s));
      return l;
    });
  await copiar(ctx, 'lancamentos_ajustes', { transformar: livre('lancamentos_ajustes', ['observacao']) });
  await copiar(ctx, 'lancamentos_ajustes_historico', { transformar: livre('lancamentos_ajustes_historico', ['antes', 'depois']) });
  await copiar(ctx, 'lancamentos_manuais', { transformar: livre('lancamentos_manuais', ['historico', 'documento']) });

  log(ctx, 'Prevision (curva S e avanço)');
  for (const t of ['prevision_dashboard_general_info', 'prevision_dashboard_scurve', 'prevision_dashboard_monthly_progress', 'prevision_dashboard_work_packages', 'prevision_dashboard_floor_evolution']) {
    if (ctx.meta.existe(t)) {
      await copiar(ctx, t, {
        transformar: comPadrao(ctx, t, (l) => {
          if ('company_id' in l && l.company_id) l.company_id = '90210';
          return l;
        }),
      });
    }
  }
}

module.exports = {
  garantirEmpresaModelo,
  garantirEquipe,
  prepararDicionarios,
  limparEmpresaModelo,
  copiarCadastros,
  copiarClientes,
  copiarCredores,
  copiarFinanceiro,
  copiarVendas,
  copiarPlanejamento,
  textoLivre,
  nomeObra,
  nomeCentro,
  nomeEmpresaGrupo,
  copiar,
  comPadrao,
  Metadados,
  Mapas,
  copiarLinhas,
  inserirLote,
};
