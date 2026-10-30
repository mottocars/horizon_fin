import { Fragment, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CalendarDays, ChevronRight, ChevronsDownUp, ChevronsUpDown, Minimize2, Percent, TriangleAlert } from 'lucide-react';
import { rastrearPocDre } from '../../../api/dreDemonstrativo.api';

const moeda = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBr = (iso) => iso.split('-').reverse().join('/');
// POC com 6 casas decimais, como no cálculo (backend utils/poc.js).
const pct6 = (f) => `${(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 6 })}%`;
const pct2 = (f) => `${(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
// Variação em pontos percentuais (f = fração); abaixo de 0,005 p.p. vira 0.
const pp = (f) => {
  const x = Math.abs(f * 100) < 0.005 ? 0 : f * 100;
  return `${x > 0 ? '+' : ''}${x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p.`;
};
const MESES_CAB = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const fimDoMes = (anoMes) =>
  new Date(Date.UTC(Number(anoMes.slice(0, 4)), Number(anoMes.slice(5, 7)), 0)).toISOString().slice(0, 10);

function mesDeHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Operações > DRE Gerencial > POC: o rastreio de como a POC de cada obra chegou no valor da DRE (pedido
// do usuário: "como um gestor enxergaria") — mesmo layout da aba DRE, sem consolidado: uma coluna por
// obra (centros com "Realiza DRE" e natureza OBRA, na ordem da aba Centros Custos), cada uma com Valor e
// Qtd / % (quantidade de unidades, percentual ou a variação em pontos percentuais). Cálculo em
// dre-demonstrativo/poc.service.js — o mesmo motor da DRE, então os números batem com ela. Blocos:
// 1. Unidades — posição no fim do período (vendidas, permutas, estoque, VGV) e o movimento (vendas e
//    distratos no período);
// 2. POC de Receita — orçamento vigente, custo incorrido, saldo de obra a executar e a POC, com o avanço
//    no período em p.p.;
// 3. POC de Despesa — as frações ideais (vendida, permutada, distratada, líquida e em estoque);
// 4. Reconhecimento na DRE — cada linha com POC: o reconhecido no período (o valor da DRE) e, abrindo,
//    a conta: acumulado × POC = reconhecido acumulado; − o já reconhecido antes; = o do período; e o
//    saldo a reconhecer (o que ainda vai entrar conforme a obra e as vendas avançam);
// 5. Resultado pela POC — margem reconhecida no período e margem a apropriar.
// Clicando no nome da obra (a célula acende no hover), a visão mês a mês dela: o período fixo à
// esquerda e uma coluna por mês, cada uma com a "foto" daquele mês (unidades no fim do mês, a POC
// evoluindo, o reconhecido no mês). `telaCheia` / `onSairTelaCheia`: como na aba DRE.
export default function PocTab({ empresaId, de, ate, centros = [], telaCheia = false, onSairTelaCheia }) {
  const [dados, setDados] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState('');
  const [mensal, setMensal] = useState(null); // obra na visão mês a mês
  const [abertas, setAbertas] = useState([]); // linhas do reconhecimento com a conta aberta
  const chaveCentros = centros.join(',');
  const mesAtual = mesDeHoje();

  useEffect(() => {
    setErro('');
    if (!empresaId) {
      setDados(null);
      return undefined;
    }
    if (de > ate) {
      setErro('A data início não pode ser depois da data fim.');
      return undefined;
    }
    let ativo = true;
    setCalculando(true);
    rastrearPocDre(empresaId, { de, ate, centros: chaveCentros ? chaveCentros.split(',') : [] })
      .then((r) => ativo && setDados(r))
      .catch((e) => ativo && setErro(e.response?.data?.message || 'Não foi possível calcular a POC.'))
      .finally(() => ativo && setCalculando(false));
    return () => {
      ativo = false;
    };
  }, [empresaId, de, ate, chaveCentros]);

  useEffect(() => {
    setMensal(null);
    setAbertas([]);
  }, [empresaId]);

  // Tela cheia: pede também a do navegador; o Esc dele sai e o `fullscreenchange` fecha a nossa
  // junto. Sem a do navegador, o Esc é tratado aqui.
  useEffect(() => {
    if (!telaCheia) return undefined;
    const doc = document.documentElement;
    if (!document.fullscreenElement && doc.requestFullscreen) doc.requestFullscreen().catch(() => {});
    const aoTrocar = () => {
      if (!document.fullscreenElement) onSairTelaCheia?.();
    };
    const aoTeclar = (e) => {
      if (e.key === 'Escape') onSairTelaCheia?.();
    };
    document.addEventListener('fullscreenchange', aoTrocar);
    window.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('fullscreenchange', aoTrocar);
      window.removeEventListener('keydown', aoTeclar);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telaCheia]);

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Percent size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver a POC.</p>
      </div>
    );
  }

  const obra = mensal !== null ? (dados?.obras || []).find((o) => o.id === mensal) : null;
  const visaoMes = Boolean(obra);
  // Colunas: as obras (cada uma com a foto do período) ou, no mês a mês, o período fixo + os meses.
  const colunas = obra
    ? [
        { chave: 'periodo', nome: 'Período', foto: obra.periodo, fixa: true },
        ...obra.meses.map((m) => ({ chave: m.mes, mes: m.mes, de: m.de, ate: m.ate, foto: m })),
      ]
    : (dados?.obras || []).map((o) => ({ chave: o.id, nome: o.nome, foto: o.periodo }));
  const linhas = dados?.linhas || [];
  const todasAbertas = linhas.length > 0 && linhas.every((l) => abertas.includes(l.id));
  const noIntervalo = visaoMes ? 'no mês' : 'no período';
  const semMascaraPoc = dados && !dados.poc_receita_mascara;

  function alternar(id) {
    setAbertas((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  return (
    <div
      className={
        telaCheia ? 'fixed inset-0 z-40 flex flex-col overflow-y-auto bg-white p-5' : 'rounded-card rounded-tl-none bg-white p-5 shadow-card'
      }
    >
      {telaCheia && (
        <div className="-mt-1 mb-2 flex items-center gap-3 border-b border-gray-100 pb-3">
          <Percent size={18} className="shrink-0 text-primary-600" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">POC{obra ? ` · ${obra.nome} mês a mês` : ''}</h2>
            <p className="text-xs text-gray-500">
              {dataBr(de)} a {dataBr(ate)}
            </p>
          </div>
          <span className="ml-auto hidden text-xs text-gray-400 sm:inline">Esc para sair</span>
          <button
            type="button"
            onClick={onSairTelaCheia}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Minimize2 size={15} />
            Sair da tela cheia
          </button>
        </div>
      )}

      {(erro || semMascaraPoc) && (
        <div className="mb-4 space-y-2">
          {erro && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              <TriangleAlert size={15} className="shrink-0" /> {erro}
            </div>
          )}
          {semMascaraPoc && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertTriangle size={14} className="shrink-0" />
              POC de Receita não gerada: escolha a Máscara DRE Nível 2 na aba Configurações.
            </div>
          )}
        </div>
      )}

      {/* Barra: voltar (no mês a mês) e abrir/fechar a conta de todas as linhas do reconhecimento. */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {obra && (
          <>
            <button
              type="button"
              onClick={() => setMensal(null)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <ArrowLeft size={14} />
              Voltar às obras
            </button>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              <CalendarDays size={15} className="text-primary-600" />
              {obra.nome}
              <span className="font-normal text-gray-500">· mês a mês</span>
            </span>
          </>
        )}
        {!obra && dados && (
          <span className="text-xs text-gray-500">
            Posição em <span className="font-medium text-gray-700">{dataBr(ate)}</span> e movimento de {dataBr(de)} a {dataBr(ate)}. Clique numa obra
            para ver mês a mês.
          </span>
        )}
        {linhas.length > 0 && (
          <button
            type="button"
            onClick={() => setAbertas(todasAbertas ? [] : linhas.map((l) => l.id))}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {todasAbertas ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
            {todasAbertas ? 'Fechar as contas' : 'Abrir as contas de todas as linhas'}
          </button>
        )}
      </div>

      {calculando && !dados ? (
        <div className="py-12 text-center text-sm text-gray-400">Calculando a POC...</div>
      ) : dados && dados.obras.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-14 text-center">
          <Percent size={26} className="mb-1 text-gray-300" />
          <p className="text-sm text-gray-600">Nenhuma obra entre os centros escolhidos.</p>
          <p className="max-w-sm text-xs text-gray-400">
            A POC mostra os centros com "Realiza DRE" e natureza Obra (aba Centros Custos da DFC).
          </p>
        </div>
      ) : dados ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-gray-700">
                <th rowSpan={2} className={`${COL_DESCRICAO} border-b border-gray-200 bg-white py-1.5 pl-4 align-bottom font-semibold`}>
                  POC
                </th>
                {colunas.map((c) =>
                  c.fixa ? (
                    <th
                      key={c.chave}
                      colSpan={2}
                      className="sticky left-[380px] z-10 border-b border-r border-b-blue-200 border-r-blue-200 bg-blue-100 px-3 pb-1 pt-1.5 text-center align-bottom font-semibold text-blue-800"
                      title={`${dataBr(de)} a ${dataBr(ate)}`}
                    >
                      Período
                    </th>
                  ) : c.mes ? (
                    <CabecalhoMes key={c.chave} coluna={c} atual={c.mes === mesAtual} />
                  ) : (
                    // A célula inteira da obra é o botão do mês a mês: o fundo todo acende no hover.
                    <th
                      key={c.chave}
                      colSpan={2}
                      onClick={() => setMensal(c.chave)}
                      className="group/centro cursor-pointer border-b border-l border-gray-200 bg-white p-0 text-center align-bottom font-semibold transition-colors hover:bg-primary-600"
                    >
                      <button
                        type="button"
                        title={`${c.chave} - ${c.nome} · ver mês a mês`}
                        className="flex w-full items-center justify-center gap-1 px-3 pb-1 pt-1.5 uppercase tracking-wide text-gray-700 transition-colors group-hover/centro:text-white"
                      >
                        <span className="line-clamp-2 whitespace-normal leading-tight">{c.nome}</span>
                        <CalendarDays size={12} className="shrink-0 text-gray-300 transition-colors group-hover/centro:text-white" />
                      </button>
                    </th>
                  )
                )}
              </tr>
              <tr className="text-[10px] uppercase tracking-wide text-gray-500">
                {colunas.map((c) => (
                  <Fragment key={c.chave}>
                    <th
                      className={`${c.fixa ? `${COL_FIXA_VALOR} border-b-blue-200 bg-blue-100 text-blue-700` : `${COL_VALOR} border-l border-gray-200 ${c.mes === mesAtual ? 'bg-[#f5f9ff]' : 'bg-white'}`} border-b py-1 text-center font-semibold`}
                    >
                      Valor
                    </th>
                    <th
                      className={`${c.fixa ? `${COL_FIXA_EXTRA} border-b-blue-200 bg-blue-100 text-blue-700` : `${COL_EXTRA} border-gray-200 ${c.mes === mesAtual ? 'bg-[#f5f9ff]' : 'bg-white'}`} border-b py-1 text-center font-semibold`}
                      title="Quantidade de unidades, percentual ou variação em pontos percentuais (p.p.) no intervalo"
                    >
                      Qtd / %
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody className={calculando ? 'opacity-50 transition-opacity' : ''}>
              <Secao titulo="Unidades" nota={visaoMes ? 'posição no fim de cada mês' : `posição em ${dataBr(ate)}`} colunas={colunas} />
              <Linha rotulo="Vendidas (contratos ativos)" colunas={colunas} valor={(f) => f.unidades?.vendidas.valor} extra={(f) => qtd(f.unidades?.vendidas.qtd)} />
              <Linha rotulo="Permutas" colunas={colunas} valor={(f) => f.unidades?.permuta.valor} extra={(f) => qtd(f.unidades?.permuta.qtd)} />
              <Linha
                rotulo="Em estoque (valor estimado)"
                dica="Unidades sem contrato ativo nem permuta. Valor estimado pelo ticket médio das vendas do mesmo tipo (aba Unidades); unidade vendida depois, pelo valor do contrato."
                colunas={colunas}
                valor={(f) => f.unidades?.estoque.valor}
                extra={(f) => qtd(f.unidades?.estoque.qtd)}
              />
              <Linha
                rotulo="Total do empreendimento (VGV)"
                forte
                colunas={colunas}
                valor={(f) => f.unidades?.total.valor}
                extra={(f) => qtd(f.unidades?.total.qtd)}
              />
              <Linha
                rotulo={`Vendas ${noIntervalo}`}
                colunas={colunas}
                valor={(f) => f.unidades?.vendas_intervalo.valor}
                extra={(f) => qtd(f.unidades?.vendas_intervalo.qtd)}
              />
              <Linha
                rotulo={`Distratos ${noIntervalo}`}
                colunas={colunas}
                valor={(f) => (f.unidades ? -f.unidades.distratos_intervalo.valor : null)}
                extra={(f) => qtd(f.unidades?.distratos_intervalo.qtd)}
              />
              <Linha
                rotulo="Distratos acumulados"
                colunas={colunas}
                valor={(f) => (f.unidades ? -f.unidades.distratos_acumulados.valor : null)}
                extra={(f) => qtd(f.unidades?.distratos_acumulados.qtd)}
              />

              <Secao
                titulo="POC de Receita"
                nota={`obra executada · custo de ${dados.poc_receita_mascara?.descricao || '—'} ÷ orçamento`}
                colunas={colunas}
              />
              <Linha rotulo="Orçamento vigente" colunas={colunas} valor={(f) => f.poc_receita?.orcamento} />
              <Linha rotulo="Custo incorrido acumulado" colunas={colunas} valor={(f) => f.poc_receita?.custo} />
              <Linha
                rotulo="Saldo de obra a executar"
                dica="Orçamento − custo incorrido: o que ainda falta gastar na obra."
                colunas={colunas}
                valor={(f) => f.poc_receita?.saldo}
              />
              <LinhaPct
                rotulo="POC de Receita"
                forte
                dica={`Custo incorrido ÷ orçamento, até 100%. Ao lado, o avanço ${noIntervalo}.`}
                colunas={colunas}
                pct={(f) => f.poc_receita?.poc}
                inicio={(f) => f.poc_receita?.poc_inicio}
              />

              <Secao titulo="POC de Despesa" nota="fração ideal das unidades" colunas={colunas} />
              <LinhaPct
                rotulo="Fração vendida (contratos)"
                dica="Fração ideal de todo contrato assinado até a data — o distratado depois sai pela fração distratada."
                colunas={colunas}
                pct={(f) => f.poc_despesa.vendas}
                inicio={(f) => f.poc_despesa.vendas_inicio}
              />
              <LinhaPct rotulo="Fração permutada" colunas={colunas} pct={(f) => f.poc_despesa.permuta} inicio={(f) => f.poc_despesa.permuta_inicio} />
              <LinhaPct
                rotulo="POC de Despesa (vendida + permutada)"
                forte
                dica="Aplicada no Custo dos Imóveis; o Estorno de Custo devolve a fração distratada."
                colunas={colunas}
                pct={(f) => f.poc_despesa.poc}
                inicio={(f) => f.poc_despesa.poc_inicio}
              />
              <LinhaPct
                rotulo="(−) Fração distratada"
                colunas={colunas}
                pct={(f) => f.poc_despesa.distratada}
                inicio={(f) => f.poc_despesa.distratada_inicio}
              />
              <LinhaPct
                rotulo="Fração líquida vendida"
                dica="POC de Despesa − fração distratada: o que de fato está vendido. Aplicada nas despesas com POC fora do CIV (comissão, legalização)."
                colunas={colunas}
                pct={(f) => f.poc_despesa.liquida}
                inicio={(f) => f.poc_despesa.liquida_inicio}
              />
              <LinhaPct
                rotulo="Fração em estoque (a vender)"
                colunas={colunas}
                pct={(f) => f.poc_despesa.estoque}
                inicio={(f) => f.poc_despesa.estoque_inicio}
              />

              <Secao titulo="Reconhecimento na DRE" nota={`valor reconhecido ${noIntervalo} · abra a linha para ver a conta`} colunas={colunas} />
              {linhas.map((l) => (
                <LinhaReconhecimento
                  key={l.id}
                  linha={l}
                  colunas={colunas}
                  aberta={abertas.includes(l.id)}
                  onAlternar={() => alternar(l.id)}
                  noIntervalo={noIntervalo}
                />
              ))}

              <Secao titulo="Resultado pela POC" nota="o que já entrou na DRE e o que ainda vai entrar" colunas={colunas} />
              <Linha rotulo={`Receitas reconhecidas ${noIntervalo}`} colunas={colunas} valor={(f) => somaLinhas(f, linhas, 'RECEITA', 'periodo')} />
              <Linha
                rotulo={`Custos e despesas reconhecidos ${noIntervalo}`}
                colunas={colunas}
                valor={(f) => somaLinhas(f, linhas, 'DESPESA', 'periodo')}
              />
              <Linha
                rotulo={`Margem reconhecida ${noIntervalo}`}
                total
                colunas={colunas}
                valor={(f) => margem(f, linhas, 'periodo').valor}
                extra={(f) => margemPct(margem(f, linhas, 'periodo'))}
              />
              <Linha
                rotulo="Receita a apropriar"
                dica="Saldo a reconhecer das receitas: entra na DRE conforme a obra avança."
                colunas={colunas}
                valor={(f) => somaLinhas(f, linhas, 'RECEITA', 'a_reconhecer')}
              />
              <Linha
                rotulo="Custo a apropriar"
                dica="Saldo a reconhecer dos custos e despesas (sem o Estorno de Custo): entra na DRE conforme as unidades forem vendidas."
                colunas={colunas}
                valor={(f) => somaLinhas(f, linhas, 'DESPESA', 'a_reconhecer')}
              />
              <Linha
                rotulo="Margem a apropriar"
                total
                colunas={colunas}
                valor={(f) => margem(f, linhas, 'a_reconhecer').valor}
                extra={(f) => margemPct(margem(f, linhas, 'a_reconhecer'))}
              />
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

const qtd = (n) => (n === null || n === undefined ? null : `${n.toLocaleString('pt-BR')} un`);

// Soma de um campo das linhas do reconhecimento de um tipo (RECEITA / DESPESA); a_reconhecer ignora o
// Estorno de Custo (null).
function somaLinhas(foto, linhas, tipo, campo) {
  return linhas.filter((l) => l.tipo === tipo).reduce((t, l) => t + (foto.linhas[l.id]?.[campo] ?? 0), 0);
}
function margem(foto, linhas, campo) {
  const receita = somaLinhas(foto, linhas, 'RECEITA', campo);
  return { valor: receita + somaLinhas(foto, linhas, 'DESPESA', campo), receita };
}
const margemPct = ({ valor, receita }) => (receita ? pct2(valor / Math.abs(receita)) : null);

// Larguras fixas: a descrição (e, no mês a mês, o período) ficam congeladas à esquerda.
const COL_DESCRICAO = 'sticky left-0 z-10 w-[380px] min-w-[380px] max-w-[380px]';
const COL_FIXA_VALOR = 'sticky left-[380px] z-10 w-36 min-w-36 max-w-36';
const COL_FIXA_EXTRA = 'sticky left-[524px] z-10 w-24 min-w-24 max-w-24 border-r border-r-blue-200';
const COL_VALOR = 'w-32 min-w-32 max-w-32';
const COL_EXTRA = 'w-24 min-w-24 max-w-24';

// "OUT/2026" numa linha só, com o ano um pouco menor; o mês atual em azul forte, como no DFC.
function CabecalhoMes({ coluna, atual }) {
  const parcial = coluna.de.slice(8) !== '01' || coluna.ate !== fimDoMes(coluna.mes);
  return (
    <th
      colSpan={2}
      title={parcial ? `${dataBr(coluna.de)} a ${dataBr(coluna.ate)}` : undefined}
      className={`border-b border-l px-3 pb-1 pt-1.5 text-center align-bottom ${
        atual ? 'border-b-[#1d5c8a] border-l-gray-200 bg-[#1d5c8a]' : 'border-gray-200 bg-white'
      }`}
    >
      <span className={`text-[11px] font-semibold tracking-wider ${atual ? 'text-white' : 'text-gray-700'}`}>
        {MESES_CAB[Number(coluna.mes.slice(5, 7)) - 1]}
        <span className={`text-[10px] font-medium tracking-normal ${atual ? 'text-white/75' : 'text-gray-400'}`}>/{coluna.mes.slice(0, 4)}</span>
      </span>
    </th>
  );
}

// Estilo das células por tipo de linha: secao (cinza, título do bloco), item, forte (item em negrito,
// subtotal), total (faixa azul escura, como as totalizadoras da DRE), conta (a conta aberta de uma
// linha do reconhecimento, mais clara).
function estilo(tipo, fixa) {
  if (tipo === 'total') return { fundo: fixa ? 'bg-[#174a70]' : 'bg-[#1d5c8a]', borda: 'border-b-[#1d5c8a]', divisa: 'border-l-white/10' };
  if (tipo === 'secao' || tipo === 'grupo')
    return fixa
      ? { fundo: 'bg-blue-100', borda: 'border-b-blue-200', divisa: '' }
      : { fundo: tipo === 'secao' ? 'bg-gray-100' : 'bg-gray-50', borda: 'border-b-gray-200', divisa: 'border-l-gray-200' };
  return fixa
    ? { fundo: 'bg-blue-50 group-hover:bg-blue-100', borda: 'border-b-blue-100', divisa: '' }
    : { fundo: tipo === 'conta' ? 'bg-slate-50/60 group-hover:bg-gray-50' : 'group-hover:bg-gray-50', borda: 'border-b-gray-100', divisa: 'border-l-gray-100' };
}

// As duas células de uma coluna numa linha: o valor (número em R$, ou texto já formatado) e o extra.
function Celulas({ tipo, fixa, valor, extra, corExtra, forte }) {
  const e = estilo(tipo, fixa);
  const total = tipo === 'total';
  const negrito = total || forte || tipo === 'grupo' ? 'font-bold' : fixa ? 'font-semibold' : '';
  let conteudo;
  if (typeof valor === 'number' && Math.abs(valor) < 0.005) valor = 0; // sem "-0,00"
  if (valor === null || valor === undefined) conteudo = tipo === 'secao' ? '' : <span className={total ? 'text-white/50' : 'text-gray-300'}>—</span>;
  else if (typeof valor === 'string') conteudo = <span className={total ? 'text-white' : 'text-gray-900'}>{valor}</span>;
  else
    conteudo = (
      <span className={valor < -0.004 ? (total ? 'text-red-300' : 'text-red-600') : total ? 'text-white' : tipo === 'conta' ? 'text-gray-600' : 'text-gray-800'}>
        {moeda(valor)}
      </span>
    );
  return (
    <>
      <td
        className={`${fixa ? COL_FIXA_VALOR : `${COL_VALOR} border-l ${e.divisa}`} ${e.fundo} border-b ${e.borda} ${
          tipo === 'secao' ? 'py-1' : 'py-px'
        } px-3 text-right text-xs tabular-nums ${negrito}`}
      >
        {conteudo}
      </td>
      <td
        className={`${fixa ? COL_FIXA_EXTRA : COL_EXTRA} ${e.fundo} border-b ${e.borda} ${tipo === 'secao' ? 'py-1' : 'py-px'} px-2 text-right text-[11px] tabular-nums ${
          negrito ? 'font-semibold' : ''
        } ${total ? 'text-white/80' : corExtra || 'text-gray-500'}`}
      >
        {extra ?? ''}
      </td>
    </>
  );
}

// Primeira coluna (congelada) de uma linha.
function Rotulo({ tipo, children, recuo = 'pl-[50px]', dica }) {
  const e = estilo(tipo, false);
  const fundo = tipo === 'total' ? 'bg-[#1d5c8a]' : tipo === 'secao' ? 'bg-gray-100' : tipo === 'grupo' ? 'bg-gray-50 group-hover:bg-gray-100' : tipo === 'conta' ? 'bg-slate-50 group-hover:bg-gray-50' : 'bg-white group-hover:bg-gray-50';
  return (
    <td className={`${COL_DESCRICAO} ${fundo} border-b ${e.borda} ${tipo === 'secao' ? 'py-1' : 'py-px'} ${recuo} pr-3`} title={dica}>
      {children}
    </td>
  );
}

// Título de um bloco (Unidades, POC de Receita…), com a nota ao lado.
function Secao({ titulo, nota, colunas }) {
  return (
    <tr>
      <Rotulo tipo="secao" recuo="pl-4">
        <span className="flex items-baseline gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs font-bold uppercase tracking-wide text-gray-900">{titulo}</span>
          {nota && <span className="truncate text-[11px] font-normal normal-case text-gray-500">{nota}</span>}
        </span>
      </Rotulo>
      {colunas.map((c) => (
        <Celulas key={c.chave} tipo="secao" fixa={c.fixa} valor={null} />
      ))}
    </tr>
  );
}

// Linha de valor em R$: `valor(foto)` e, opcional, `extra(foto)` (texto: quantidade, percentual).
function Linha({ rotulo, colunas, valor, extra, forte, total, dica }) {
  const tipo = total ? 'total' : 'item';
  return (
    <tr className="group">
      <Rotulo tipo={tipo} recuo={total ? 'pl-4' : 'pl-[50px]'} dica={dica}>
        <span className={`truncate text-xs ${total ? 'font-bold uppercase tracking-wide text-white' : forte ? 'font-semibold text-gray-900' : 'text-gray-700'} ${dica ? 'cursor-help' : ''}`}>
          {rotulo}
        </span>
      </Rotulo>
      {colunas.map((c) => (
        <Celulas key={c.chave} tipo={tipo} fixa={c.fixa} forte={forte} valor={valor(c.foto)} extra={extra ? extra(c.foto) : null} />
      ))}
    </tr>
  );
}

// Linha de percentual (POC, frações): o percentual em 6 casas no lugar do valor e, no extra, a variação
// no intervalo em p.p. (foto no fim − na véspera do início).
function LinhaPct({ rotulo, colunas, pct, inicio, forte, dica }) {
  return (
    <tr className="group">
      <Rotulo tipo="item" dica={dica}>
        <span className={`truncate text-xs ${forte ? 'font-semibold text-gray-900' : 'text-gray-700'} ${dica ? 'cursor-help' : ''}`}>{rotulo}</span>
      </Rotulo>
      {colunas.map((c) => {
        const p = pct(c.foto);
        const i = inicio(c.foto);
        const d = p === null || p === undefined || i === null || i === undefined ? null : p - i;
        return (
          <Celulas
            key={c.chave}
            tipo="item"
            fixa={c.fixa}
            forte={forte}
            valor={p === null || p === undefined ? null : pct6(p)}
            extra={d === null ? null : pp(d)}
            corExtra={d === null || Math.abs(d) < 0.00005 ? 'text-gray-400' : 'text-primary-600'}
          />
        );
      })}
    </tr>
  );
}

const STATUS_POC = {
  RECEITA: { sigla: 'PR', titulo: 'POC de Receita', cor: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  DESPESA: { sigla: 'PD', titulo: 'POC de Despesa', cor: 'bg-red-100 text-red-700 ring-red-200' },
};

// Uma linha da DRE que passa pela POC: o reconhecido no intervalo (o valor da DRE) com a POC aplicada ao
// lado; aberta, a conta — acumulado × POC = reconhecido acumulado; − o já reconhecido antes; = o do
// intervalo; e o saldo a reconhecer.
function LinhaReconhecimento({ linha, colunas, aberta, onAlternar, noIntervalo }) {
  const s = STATUS_POC[linha.tipo];
  const dado = (c) => c.foto.linhas[linha.id];
  const conta = [
    { rotulo: 'Acumulado (base até o fim)', valor: (c) => dado(c)?.acumulado },
    {
      rotulo: '× POC aplicada = reconhecido acumulado',
      valor: (c) => dado(c)?.reconhecido,
      extra: (c) => (dado(c) ? pct6(dado(c).poc) : null),
      dica: linha.estorno ? 'Fração distratada' : linha.tipo === 'RECEITA' ? 'POC de Receita' : 'POC de Despesa',
    },
    { rotulo: '(−) Já reconhecido antes', valor: (c) => (dado(c) ? -dado(c).anterior : null) },
    { rotulo: `(=) Reconhecido ${noIntervalo}`, valor: (c) => dado(c)?.periodo, forte: true },
    {
      rotulo: 'Saldo a reconhecer (acumulado − reconhecido)',
      valor: (c) => dado(c)?.a_reconhecer,
      dica: linha.estorno ? 'O Estorno de Custo não tem saldo a apropriar.' : 'O que ainda vai entrar na DRE conforme a obra e as vendas avançam.',
    },
  ];
  return (
    <>
      <tr className="group cursor-pointer" onClick={onAlternar}>
        <Rotulo tipo="grupo" recuo="pl-4">
          <span className="flex items-center gap-1.5">
            <ChevronRight size={14} className={`shrink-0 text-gray-400 transition-transform ${aberta ? 'rotate-90' : ''}`} />
            <span
              title={s.titulo}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold leading-none ring-1 ${s.cor}`}
            >
              {s.sigla}
            </span>
            <span className="truncate text-xs font-bold uppercase tracking-wide text-gray-900">{linha.descricao}</span>
          </span>
        </Rotulo>
        {colunas.map((c) => (
          <Celulas
            key={c.chave}
            tipo="grupo"
            fixa={c.fixa}
            valor={dado(c)?.periodo}
            extra={dado(c) ? `× ${pct2(dado(c).poc)}` : null}
            corExtra="text-gray-500"
          />
        ))}
      </tr>
      {aberta &&
        conta.map((passo) => (
          <tr key={passo.rotulo} className="group">
            <Rotulo tipo="conta" recuo="pl-[62px]" dica={passo.dica}>
              <span className={`truncate text-xs ${passo.forte ? 'font-semibold text-gray-900' : 'text-gray-600'} ${passo.dica ? 'cursor-help' : ''}`}>
                {passo.rotulo}
              </span>
            </Rotulo>
            {colunas.map((c) => (
              <Celulas
                key={c.chave}
                tipo="conta"
                fixa={c.fixa}
                forte={passo.forte}
                valor={passo.valor(c)}
                extra={passo.extra ? passo.extra(c) : null}
                corExtra="text-primary-600"
              />
            ))}
          </tr>
        ))}
    </>
  );
}
