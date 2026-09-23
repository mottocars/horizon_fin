import { Fragment, useState } from 'react';
import { Landmark } from 'lucide-react';
import { formatarSaldo, nomeMes } from './constantes';

const LARGURA_PRIMEIRA = 300;
const LARGURA_DIA = 108;

// Cor-farol (magenta puro) improvável de aparecer em qualquer conteúdo real do relatório — o
// gerador (gerarRelatorioPdf.jsx) escaneia o CANVAS JÁ CAPTURADO procurando por ela pra achar a
// borda de cima de cada linha em coordenadas de PIXEL DE VERDADE, em vez de confiar numa medição
// separada do DOM (getBoundingClientRect) — testado e confirmado que o html2canvas renderiza
// numa cópia/iframe interna que pode ficar alguns pixels fora de sincronia com o DOM ao vivo, o
// suficiente pra cortar o topo de uma linha mesmo com a conta batendo perfeitamente no papel.
// Duas tentativas anteriores falharam no html2canvas: um filho `position: absolute` dentro de
// um item de CSS Grid simplesmente não aparecia no canvas capturado; `box-shadow: inset`
// aparecia, só que preenchendo a CÉLULA INTEIRA em vez de só uma listra fina (os dois
// confirmados olhando o canvas capturado de verdade, não só supondo). Um <span> comum, real,
// no fluxo — o de sempre funcionar em qualquer motor de renderização — resolve: `alignSelf:
// flex-start` gruda ele no topo da ÁREA DE CONTEÚDO da linha (que é flex) mesmo com os outros
// itens centralizados. Só que "topo da área de conteúdo" é DEPOIS do padding-top da própria
// linha — sem compensar isso, o marcador (e a quebra de página calculada a partir dele) fica
// alguns pixels ABAIXO do topo de verdade, cortando a própria linha (confirmado comparando o
// canvas cru com o recorte final). `deslocar` cancela esse padding-top com uma margem negativa,
// grudando o marcador na borda de cima real da linha. `marginRight` negativo cancela a largura
// que ele ocuparia, sem empurrar o resto do conteúdo.
function MarcadorLinha({ deslocar = 6 }) {
  return <span style={{ display: 'block', alignSelf: 'flex-start', width: 14, height: 3, marginTop: -deslocar, marginRight: -14, background: 'rgb(255, 0, 255)' }} />;
}

// Só o valor, em preto (vermelho se negativo — mesma convenção de sempre) — pedido do usuário:
// o relatório pode ser exportado com período aberto ou não, então nenhuma cor de status
// (âmbar/verde/roxo/azul/cinza) faz sentido nele; só o número no lugar certo.
function CelulaValor({ valor }) {
  const preenchido = valor !== undefined && valor !== null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: 36, boxSizing: 'border-box', padding: '6px 10px' }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: !preenchido ? '#d1d5db' : valor < 0 ? '#dc2626' : '#111827', fontVariantNumeric: 'tabular-nums' }}>
        {preenchido ? formatarSaldo(valor) : '—'}
      </span>
    </div>
  );
}

// Logo do banco com crossOrigin explícito — necessário pro html2canvas conseguir capturar a
// imagem (servida por CDN externa) sem "sujar" o canvas. Cai no fallback (código do banco) se
// a imagem falhar — mesmo comportamento do LogoBanco.jsx da tela ao vivo.
function LogoBancoImpressao({ codigo, info }) {
  const [falhou, setFalhou] = useState(false);
  const caixa = { display: 'flex', height: 22, width: 22, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 6 };
  if (info?.logo && !falhou) {
    return (
      <span style={{ ...caixa, background: '#fff', border: '1px solid #e5e7eb' }}>
        <img
          src={info.logo}
          alt=""
          crossOrigin="anonymous"
          onError={() => setFalhou(true)}
          style={{ height: 16, width: 16, objectFit: 'contain' }}
        />
      </span>
    );
  }
  if (codigo) {
    return <span style={{ ...caixa, background: '#f3f4f6', fontSize: 9, fontWeight: 600, color: '#6b7280' }}>{codigo}</span>;
  }
  return (
    <span style={{ ...caixa, background: '#f9fafb', color: '#d1d5db' }}>
      <Landmark size={11} />
    </span>
  );
}

// Cabeçalho (mês + dia) compartilhado pelas duas grades (resumo por classificação e detalhe
// por conta) — sem cor de "dia aberto"/fim de semana (pedido do usuário: o relatório não deve
// mudar de cara dependendo do estado do período).
function CabecalhoDias({ dias, meses, tituloPrimeira }) {
  return (
    <>
      <div
        data-linha="cabecalho"
        style={{
          gridRow: '1 / 3',
          display: 'flex',
          alignItems: 'flex-end',
          minHeight: 52,
          boxSizing: 'border-box',
          borderBottom: '2px solid #d1d5db',
          borderRight: '1px solid #e5e7eb',
          padding: '6px 8px',
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: '#9ca3af',
        }}
      >
        <MarcadorLinha />
        {tituloPrimeira}
      </div>
      {meses.map((m) => (
        <div
          key={`${m.ano}-${m.mes}`}
          style={{
            gridColumn: `span ${m.dias}`,
            display: 'flex',
            alignItems: 'center',
            minHeight: 24,
            boxSizing: 'border-box',
            borderBottom: '1px solid #e5e7eb',
            borderLeft: '1px solid #e5e7eb',
            padding: '4px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: '#374151',
          }}
        >
          {nomeMes(m.ano, m.mes)}
        </div>
      ))}
      {dias.map((d) => (
        <div
          key={d.iso}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 4,
            minHeight: 34,
            boxSizing: 'border-box',
            borderBottom: '2px solid #d1d5db',
            borderLeft: '1px solid #e5e7eb',
            padding: '4px 10px',
            background: '#ffffff',
          }}
        >
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.3, color: '#9ca3af' }}>{d.semana}</span>
          <span style={{ fontSize: 11, fontWeight: d.hoje ? 700 : 500, color: '#374151' }}>{String(d.dia).padStart(2, '0')}</span>
        </div>
      ))}
    </>
  );
}

// Componente de IMPRESSÃO — não é interativo (sem inputs, sem colapsar grupo), é o "espelho"
// estático da grade ao vivo pra virar PDF: todos os grupos já vêm expandidos e filtrados (só
// contas/classificações com saldo na semana — ver SaldosContasTab.jsx::exportarPDF).
// Renderizado fora da tela (ver gerarRelatorioPdf.jsx) e fotografado com html2canvas; cada
// bloco relevante tem `data-linha`/`data-secao` pra o gerador medir e paginar sem cortar
// nenhuma linha ao meio.
export default function RelatorioSaldosImpressao({ empresaLabel, filtros, nomeUsuario, geradoEm, dias, meses, grupos, totaisPorGrupo, totalGeral, infoBancos }) {
  const colunas = `${LARGURA_PRIMEIRA}px repeat(${dias.length}, ${LARGURA_DIA}px)`;

  // Só classificações com algum saldo na semana (pedido do usuário) — como `grupos` já chega
  // filtrado (só contas com saldo), isso na prática é "todo grupo restante", mas o total do
  // grupo pode ainda estar vazio num caso extremo (contas com saldo em dias diferentes que
  // somem zero dias em comum) — o filtro explícito cobre esse caso também.
  const gruposComSaldo = grupos.filter((g) => Object.keys(totaisPorGrupo[g.value] || {}).length > 0);

  return (
    <div style={{ width: 1160, background: '#ffffff', padding: 32, fontFamily: 'Inter, Arial, sans-serif', color: '#111827' }}>
      <div data-secao="cabecalho">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '2px solid #1d4ed8', paddingBottom: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logomarca.svg" alt="Horizon Fin" style={{ height: 34 }} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#111827' }}>Relatório de Saldo das Contas Bancárias</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{empresaLabel || '—'}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#6b7280', lineHeight: 1.6 }}>
            <div>
              Gerado por <strong style={{ color: '#111827' }}>{nomeUsuario}</strong>
            </div>
            <div>{geradoEm}</div>
          </div>
        </div>

        {filtros.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            {filtros.map((f) => (
              <span
                key={f.label}
                style={{ fontSize: 10.5, padding: '4px 10px', borderRadius: 999, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' }}
              >
                <strong>{f.label}:</strong> {f.valor}
              </span>
            ))}
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Evolução do saldo total na semana
          </div>
          <div style={{ border: '1px solid #eef0f3', borderRadius: 10, padding: '8px 4px' }}>
            <GraficoEvolucao dias={dias} totalGeral={totalGeral} />
          </div>
        </div>
      </div>

      {/* Saldos por Classificação — resumo antes do detalhe por conta (pedido do usuário) */}
      <div data-secao="resumo-classificacao">
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Saldos por Classificação
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: colunas, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 28 }}>
          <CabecalhoDias dias={dias} meses={meses} tituloPrimeira="Classificação" />
          {gruposComSaldo.map((grupo) => {
            const totais = totaisPorGrupo[grupo.value] || {};
            return (
              <Fragment key={grupo.value}>
                <div
                  data-linha={`resumo-${grupo.value}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minHeight: 36,
                    boxSizing: 'border-box',
                    borderBottom: '1px solid #f3f4f6',
                    borderRight: '1px solid #e5e7eb',
                    padding: '6px 8px 6px 10px',
                  }}
                >
                  <MarcadorLinha />
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#111827' }}>{grupo.label}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 999, padding: '1px 6px' }}>
                    {grupo.contas.length}
                  </span>
                </div>
                {dias.map((d) => (
                  <div key={d.iso} style={{ borderBottom: '1px solid #f3f4f6', borderLeft: '1px solid #e5e7eb' }}>
                    <CelulaValor valor={totais[d.iso]} />
                  </div>
                ))}
              </Fragment>
            );
          })}
          <div
            data-linha="resumo-total"
            style={{ display: 'flex', alignItems: 'center', minHeight: 40, boxSizing: 'border-box', borderTop: '2px solid #d1d5db', borderRight: '1px solid #e5e7eb', padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: '#374151' }}
          >
            <MarcadorLinha deslocar={8} />
            Total geral
          </div>
          {dias.map((d) => (
            <div key={d.iso} style={{ borderTop: '2px solid #d1d5db', borderLeft: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: 40, boxSizing: 'border-box', padding: '8px 10px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: totalGeral[d.iso] < 0 ? '#dc2626' : '#111827' }}>
                  {totalGeral[d.iso] !== undefined ? formatarSaldo(totalGeral[d.iso]) : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Saldos por Conta — detalhe, todos os grupos expandidos */}
      <div data-secao="detalhe-contas">
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Saldos por Conta
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: colunas, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <CabecalhoDias dias={dias} meses={meses} tituloPrimeira="Classificação / Conta bancária" />

          {grupos.map((grupo) => {
            const totais = totaisPorGrupo[grupo.value] || {};
            return (
              <Fragment key={grupo.value}>
                <div
                  data-linha={`grupo-${grupo.value}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minHeight: 36,
                    boxSizing: 'border-box',
                    background: '#f9fafb',
                    borderBottom: '1px solid #e5e7eb',
                    borderRight: '1px solid #e5e7eb',
                    padding: '6px 8px 6px 10px',
                  }}
                >
                  <MarcadorLinha />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{grupo.label}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, color: '#6b7280', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 999, padding: '1px 6px' }}>
                    {grupo.contas.length}
                  </span>
                </div>
                {dias.map((d) => (
                  <div key={d.iso} style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', borderLeft: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: 36, boxSizing: 'border-box', padding: '6px 10px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: totais[d.iso] < 0 ? '#dc2626' : '#111827' }}>
                        {totais[d.iso] !== undefined ? formatarSaldo(totais[d.iso]) : '—'}
                      </span>
                    </div>
                  </div>
                ))}

                {grupo.contas.map((conta) => (
                  <Fragment key={`${grupo.value}-${conta.company_id}-${conta.numero_conta}`}>
                    <div
                      data-linha={`conta-${grupo.value}-${conta.company_id}-${conta.numero_conta}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        minHeight: 40,
                        boxSizing: 'border-box',
                        borderBottom: '1px solid #f3f4f6',
                        borderRight: '1px solid #e5e7eb',
                        padding: '6px 10px 6px 26px',
                      }}
                    >
                      <MarcadorLinha />
                      <LogoBancoImpressao codigo={conta.banco_codigo} info={infoBancos?.get(conta.banco_codigo)} />
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 11,
                          fontWeight: 500,
                          color: '#1f2937',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {conta.nome || conta.numero_conta}
                      </span>
                      {conta.status !== 'ENABLED' && (
                        <span style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', borderRadius: 4, padding: '1px 5px' }}>
                          Inativa
                        </span>
                      )}
                    </div>
                    {dias.map((d) => (
                      <div key={d.iso} style={{ borderBottom: '1px solid #f3f4f6', borderLeft: '1px solid #e5e7eb' }}>
                        <CelulaValor valor={conta.saldos[d.iso]} />
                      </div>
                    ))}
                  </Fragment>
                ))}
              </Fragment>
            );
          })}

          <div
            data-linha="detalhe-total"
            style={{ display: 'flex', alignItems: 'center', minHeight: 40, boxSizing: 'border-box', borderTop: '2px solid #d1d5db', borderRight: '1px solid #e5e7eb', padding: '8px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: '#374151' }}
          >
            <MarcadorLinha deslocar={8} />
            Total geral
          </div>
          {dias.map((d) => (
            <div key={d.iso} style={{ borderTop: '2px solid #d1d5db', borderLeft: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minHeight: 40, boxSizing: 'border-box', padding: '8px 10px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: totalGeral[d.iso] < 0 ? '#dc2626' : '#111827' }}>
                  {totalGeral[d.iso] !== undefined ? formatarSaldo(totalGeral[d.iso]) : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Gráfico de linha da evolução do saldo total na semana — SVG desenhado à mão (o projeto não
// tem nenhuma lib de gráficos instalada, e 7 pontos não justifica adicionar uma só pra isso).
function GraficoEvolucao({ dias, totalGeral }) {
  const pontos = dias.map((d) => ({ ...d, valor: totalGeral[d.iso] }));
  const comValor = pontos.filter((p) => p.valor !== undefined);
  if (comValor.length === 0) {
    return (
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 12 }}>
        Nenhum saldo lançado nesta semana ainda.
      </div>
    );
  }

  const LARGURA = 1080;
  const ALTURA = 210;
  const PAD_ESQ = 72;
  const PAD_DIR = 24;
  const PAD_TOPO = 24;
  const PAD_BASE = 30;
  const areaLargura = LARGURA - PAD_ESQ - PAD_DIR;
  const areaAltura = ALTURA - PAD_TOPO - PAD_BASE;

  const valores = comValor.map((p) => p.valor);
  let min = Math.min(...valores, 0);
  let max = Math.max(...valores, 0);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const folga = (max - min) * 0.12 || 1;
  min -= folga;
  max += folga;

  const x = (i) => PAD_ESQ + (areaLargura * i) / Math.max(dias.length - 1, 1);
  const y = (v) => PAD_TOPO + areaAltura - ((v - min) / (max - min)) * areaAltura;

  const segmentos = [];
  let atual = [];
  pontos.forEach((p, i) => {
    if (p.valor === undefined) {
      if (atual.length) segmentos.push(atual);
      atual = [];
      return;
    }
    atual.push({ ...p, px: x(i), py: y(p.valor) });
  });
  if (atual.length) segmentos.push(atual);

  return (
    <svg width={LARGURA} height={ALTURA} viewBox={`0 0 ${LARGURA} ${ALTURA}`}>
      <defs>
        <linearGradient id="gradienteEvolucaoSaldo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const yy = PAD_TOPO + areaAltura * f;
        const valor = max - (max - min) * f;
        return (
          <g key={f}>
            <line x1={PAD_ESQ} x2={LARGURA - PAD_DIR} y1={yy} y2={yy} stroke="#eef0f3" strokeWidth="1" />
            <text x={PAD_ESQ - 10} y={yy + 3} textAnchor="end" fontSize="10" fill="#9ca3af">
              {valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </text>
          </g>
        );
      })}

      {segmentos.map((seg, i) => (
        <polygon
          key={`area-${i}`}
          points={`${seg.map((p) => `${p.px},${p.py}`).join(' ')} ${seg[seg.length - 1].px},${PAD_TOPO + areaAltura} ${seg[0].px},${PAD_TOPO + areaAltura}`}
          fill="url(#gradienteEvolucaoSaldo)"
        />
      ))}
      {segmentos.map((seg, i) => (
        <polyline
          key={`linha-${i}`}
          points={seg.map((p) => `${p.px},${p.py}`).join(' ')}
          fill="none"
          stroke="#2563eb"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {pontos.map((p, i) => {
        if (p.valor === undefined) return null;
        return (
          <g key={p.iso}>
            <circle cx={x(i)} cy={y(p.valor)} r={p.hoje ? 5.5 : 3.5} fill="#2563eb" stroke="#fff" strokeWidth="1.5" />
            <text x={x(i)} y={y(p.valor) - 11} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#374151">
              {formatarSaldo(p.valor)}
            </text>
          </g>
        );
      })}

      {pontos.map((p, i) => (
        <text key={`eixo-${p.iso}`} x={x(i)} y={ALTURA - 8} textAnchor="middle" fontSize="10" fill="#6b7280">
          {p.semana.toUpperCase()} {String(p.dia).padStart(2, '0')}
        </text>
      ))}
    </svg>
  );
}
