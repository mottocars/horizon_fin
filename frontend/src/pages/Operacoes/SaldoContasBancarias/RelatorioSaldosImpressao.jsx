import { Fragment, useState } from 'react';
import { History, Landmark, Pencil, Zap } from 'lucide-react';
import { formatarSaldo, nomeMes } from './constantes';

// Mesma paleta/ícone por origem da grade ao vivo (CelulaSaldo, em SaldosContasTab.jsx) — o
// relatório é um espelho estático, então repete a mesma lógica de cor em vez de importar um
// componente com estado/edição.
const ORIGEM_INFO = {
  API: { icone: Zap, bg: '#ecfdf5', borda: '#d1fae5', iconeCor: '#10b981', texto: 'Automático (VanPix)' },
  HERDADO: { icone: History, bg: '#faf5ff', borda: '#f3e8ff', iconeCor: '#a855f7', texto: 'Herdado do dia anterior' },
  MANUAL: { icone: Pencil, bg: '#eff6ff', borda: '#dbeafe', iconeCor: '#3b82f6', texto: 'Lançado manualmente' },
};

const LARGURA_PRIMEIRA = 300;
const LARGURA_DIA = 108;

function celulaEstilo({ preenchido, bloqueada, pendente }) {
  if (bloqueada) return { bg: '#f9fafb', borda: 'transparent' };
  if (preenchido) return null; // resolvido por origem
  if (pendente) return { bg: '#fffbeb', borda: '#fde68a' };
  return { bg: 'transparent', borda: 'transparent' };
}

function CelulaImpressao({ valor, origem, bloqueada, pendente }) {
  const preenchido = valor !== undefined && valor !== null;
  const infoOrigem = preenchido ? ORIGEM_INFO[origem] || ORIGEM_INFO.MANUAL : null;
  const estiloBase = celulaEstilo({ preenchido, bloqueada, pendente });
  const bg = infoOrigem && !bloqueada ? infoOrigem.bg : estiloBase?.bg;
  const borda = infoOrigem && !bloqueada ? infoOrigem.borda : estiloBase?.borda;
  const Icone = infoOrigem?.icone;
  const corTexto = bloqueada ? '#9ca3af' : valor < 0 ? '#dc2626' : '#111827';

  return (
    <div
      style={{
        position: 'relative',
        height: 32,
        borderRadius: 6,
        border: `1px solid ${borda}`,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 8px',
        margin: 2,
      }}
    >
      {Icone && (
        <Icone size={11} color={infoOrigem.iconeCor} style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)' }} />
      )}
      <span style={{ fontSize: 11, fontWeight: 500, color: corTexto, fontVariantNumeric: 'tabular-nums' }}>
        {preenchido ? formatarSaldo(valor) : ''}
      </span>
    </div>
  );
}

function ValorTotalImpressao({ valor }) {
  if (valor === undefined) return <span style={{ color: '#d1d5db' }}>—</span>;
  return <span style={{ color: valor < 0 ? '#dc2626' : '#111827' }}>{formatarSaldo(valor)}</span>;
}

// Logo do banco com crossOrigin explícito — necessário pro html2canvas conseguir capturar a
// imagem (servida por CDN externa) sem "sujar" o canvas. Precisa de estado pra cair no mesmo
// fallback visual do LogoBanco.jsx da tela ao vivo quando a imagem falha (banco sem logo
// cadastrada, CDN fora do ar etc.) — sem isso vira um ícone de imagem quebrada no PDF.
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
    return (
      <span style={{ ...caixa, background: '#f3f4f6', fontSize: 9, fontWeight: 600, color: '#6b7280' }}>{codigo}</span>
    );
  }
  return (
    <span style={{ ...caixa, background: '#f9fafb', color: '#d1d5db' }}>
      <Landmark size={11} />
    </span>
  );
}

// Gráfico de linha da evolução do saldo total na semana — SVG desenhado à mão (o projeto não
// tem nenhuma lib de gráficos instalada, e 7 pontos não justifica adicionar uma só pra isso).
function GraficoEvolucao({ dias, totalGeral, dataAberta }) {
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
        const aberto = p.iso === dataAberta;
        return (
          <g key={p.iso}>
            <circle cx={x(i)} cy={y(p.valor)} r={aberto ? 5.5 : 3.5} fill={aberto ? '#f59e0b' : '#2563eb'} stroke="#fff" strokeWidth="1.5" />
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

// Componente de IMPRESSÃO — não é interativo (sem inputs, sem colapsar grupo), é o "espelho"
// estático da grade ao vivo pra virar PDF: todos os grupos já vêm expandidos, e cada célula usa
// a mesma lógica visual de origem/bloqueio da tela. Renderizado fora da tela (ver
// gerarRelatorioPdf.js) e fotografado com html2canvas.
export default function RelatorioSaldosImpressao({
  empresaLabel,
  filtros,
  nomeUsuario,
  geradoEm,
  dias,
  meses,
  grupos,
  totaisPorGrupo,
  totalGeral,
  dataAberta,
  infoBancos,
}) {
  return (
    <div style={{ width: 1160, background: '#ffffff', padding: 32, fontFamily: 'Inter, Arial, sans-serif', color: '#111827' }}>
      {/* Cabeçalho */}
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

      {/* Filtros aplicados */}
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

      {/* Gráfico */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Evolução do saldo total na semana
        </div>
        <div style={{ border: '1px solid #eef0f3', borderRadius: 10, padding: '8px 4px' }}>
          <GraficoEvolucao dias={dias} totalGeral={totalGeral} dataAberta={dataAberta} />
        </div>
      </div>

      {/* Tabela — espelho da grade, todos os grupos expandidos */}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Saldos por conta
      </div>
      {/* CSS Grid em vez de <table>: o html2canvas tem um bug conhecido de desalinhar linhas
          com `border-collapse: collapse` (testado e confirmado nesta tela — o texto das linhas
          ficava sobreposto na captura, mesmo a árvore DOM estando correta). Grid dá altura de
          linha 100% determinística por célula, sem essa armadilha. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${LARGURA_PRIMEIRA}px repeat(${dias.length}, ${LARGURA_DIA}px)`,
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {/* cabeçalho: nome (ocupa as 2 linhas do cabeçalho) + mês + dia */}
        <div
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
          Classificação / Conta bancária
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
        {dias.map((d) => {
          const aberto = d.iso === dataAberta;
          return (
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
                background: aberto ? '#fef3c7' : d.fimDeSemana ? '#f9fafb' : '#ffffff',
              }}
            >
              <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.3, color: aberto ? '#b45309' : d.fimDeSemana ? '#d1d5db' : '#9ca3af' }}>
                {d.semana}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  height: 18,
                  minWidth: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 999,
                  padding: '0 4px',
                  fontSize: 11,
                  fontWeight: 700,
                  background: d.hoje ? '#1d4ed8' : 'transparent',
                  color: d.hoje ? '#fff' : aberto ? '#92400e' : '#374151',
                }}
              >
                {String(d.dia).padStart(2, '0')}
              </span>
            </div>
          );
        })}

        {/* corpo: cada grupo já vem expandido (é um espelho, não tem estado de colapsar) */}
        {grupos.map((grupo) => {
          const totais = totaisPorGrupo[grupo.value] || {};
          return (
            <Fragment key={grupo.value}>
              <div
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
                <span style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{grupo.label}</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: '#6b7280', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 999, padding: '1px 6px' }}>
                  {grupo.contas.length}
                </span>
              </div>
              {dias.map((d) => (
                <div
                  key={d.iso}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    minHeight: 36,
                    boxSizing: 'border-box',
                    borderBottom: '1px solid #e5e7eb',
                    borderLeft: '1px solid #e5e7eb',
                    padding: '6px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    background: d.iso === dataAberta ? '#fffbeb' : '#f9fafb',
                  }}
                >
                  <ValorTotalImpressao valor={totais[d.iso]} />
                </div>
              ))}

              {grupo.contas.map((conta) => (
                <Fragment key={`${grupo.value}-${conta.company_id}-${conta.numero_conta}`}>
                  <div
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
                    <div
                      key={d.iso}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        minHeight: 40,
                        boxSizing: 'border-box',
                        borderBottom: '1px solid #f3f4f6',
                        borderLeft: '1px solid #e5e7eb',
                        padding: 4,
                        background: d.fimDeSemana ? '#fafafa' : '#fff',
                      }}
                    >
                      <CelulaImpressao
                        valor={conta.saldos[d.iso]}
                        origem={conta.origens?.[d.iso]}
                        bloqueada={d.iso !== dataAberta}
                        pendente={d.pendente}
                      />
                    </div>
                  ))}
                </Fragment>
              ))}
            </Fragment>
          );
        })}

        {/* rodapé */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            minHeight: 40,
            boxSizing: 'border-box',
            borderTop: '2px solid #d1d5db',
            borderRight: '1px solid #e5e7eb',
            padding: '8px 10px',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            color: '#374151',
          }}
        >
          Total geral
        </div>
        {dias.map((d) => (
          <div
            key={d.iso}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              minHeight: 40,
              boxSizing: 'border-box',
              borderTop: '2px solid #d1d5db',
              borderLeft: '1px solid #e5e7eb',
              padding: '8px 10px',
              fontSize: 12,
              fontWeight: 700,
              background: d.iso === dataAberta ? '#fffbeb' : d.fimDeSemana ? '#f9fafb' : '#fff',
            }}
          >
            <ValorTotalImpressao valor={totalGeral[d.iso]} />
          </div>
        ))}
      </div>
    </div>
  );
}
