import { useMemo } from 'react';
import Card from '../../../components/Card';
import { TELAS_SISTEMA } from '../../../config/telas';

const LIMITE_TELAS = 12;

// Rampa sequencial num hue só (azul da marca), clara -> escura — os mesmos
// tons de primary-50 a primary-700 já usados no resto do app (ver
// styles/index.css), só que com os degraus intermediários que o tema não
// declara, pra interpolar suavemente célula a célula.
const RAMPA = ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'];

function hexParaRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// sqrt em vez de linear: sem isso, um único outlier de uso concentra quase
// toda a rampa nele e deixa todo o resto do mapa indistinguível (quase
// branco), já que a maioria das células tende a ter valores bem menores que
// o máximo.
function corCelula(valor, max) {
  if (!valor) return { bg: '#f9fafb', texto: '#d1d5db' };
  const t = Math.sqrt(valor / max);
  const idx = t * (RAMPA.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(RAMPA.length - 1, lo + 1);
  const frac = idx - lo;
  const a = hexParaRgb(RAMPA[lo]);
  const b = hexParaRgb(RAMPA[hi]);
  const r = Math.round(a.r + (b.r - a.r) * frac);
  const g = Math.round(a.g + (b.g - a.g) * frac);
  const bl = Math.round(a.b + (b.b - a.b) * frac);
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * bl) / 255;
  return { bg: `rgb(${r}, ${g}, ${bl})`, texto: luminancia > 0.6 ? '#1f2937' : '#ffffff' };
}

export default function HeatmapUsuarioTela({ matriz, porTela }) {
  const { usuarios, telas, totalMap, maiorValor } = useMemo(() => {
    const telasTop = porTela.slice(0, LIMITE_TELAS).map((t) => t.tela);
    const telasSet = new Set(telasTop);

    const totalPorUsuario = new Map();
    const nomePorUsuario = new Map();
    const mapa = new Map();
    let maior = 0;

    matriz.forEach((c) => {
      nomePorUsuario.set(c.usuario_id, c.usuario_nome);
      totalPorUsuario.set(c.usuario_id, (totalPorUsuario.get(c.usuario_id) || 0) + c.total);
      if (telasSet.has(c.tela)) {
        mapa.set(`${c.usuario_id}|${c.tela}`, c.total);
        if (c.total > maior) maior = c.total;
      }
    });

    const listaUsuarios = Array.from(nomePorUsuario, ([id, nome]) => ({
      id,
      nome,
      total: totalPorUsuario.get(id) || 0,
    })).sort((a, b) => b.total - a.total);

    return { usuarios: listaUsuarios, telas: telasTop, totalMap: mapa, maiorValor: Math.max(1, maior) };
  }, [matriz, porTela]);

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Acessos por usuário e tela</h2>
          <p className="text-xs text-gray-500">
            Quantas vezes cada usuário acessou cada tela {porTela.length > LIMITE_TELAS ? `(top ${LIMITE_TELAS} telas)` : ''} no período
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <span>Menos</span>
          <span
            className="h-2.5 w-20 rounded-full"
            style={{ background: `linear-gradient(90deg, ${RAMPA[0]}, ${RAMPA[RAMPA.length - 1]})` }}
          />
          <span>Mais</span>
        </div>
      </div>

      {usuarios.length === 0 || telas.length === 0 ? (
        <p className="mt-6 py-6 text-center text-sm text-gray-400">Sem acessos registrados nesse período.</p>
      ) : (
        <div className="mt-4 max-h-[520px] overflow-auto rounded-lg border border-gray-100">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 min-w-[160px] border-b border-gray-100 bg-white px-3 py-2 text-left font-medium text-gray-500">
                  Usuário
                </th>
                {telas.map((tela) => {
                  const label = TELAS_SISTEMA[tela]?.title || tela;
                  return (
                    <th
                      key={tela}
                      className="sticky top-0 z-10 min-w-[84px] max-w-[84px] border-b border-l border-gray-100 bg-white px-1 py-2 align-bottom"
                    >
                      <span
                        className="block text-center text-[10.5px] font-medium leading-tight text-gray-500"
                        style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        title={label}
                      >
                        {label}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {usuarios.map((usuario) => (
                <tr key={usuario.id}>
                  <td
                    className="sticky left-0 z-10 max-w-[160px] truncate border-b border-gray-50 bg-white px-3 py-2 text-left font-medium text-gray-700"
                    title={usuario.nome}
                  >
                    {usuario.nome}
                  </td>
                  {telas.map((tela) => {
                    const valor = totalMap.get(`${usuario.id}|${tela}`) || 0;
                    const { bg, texto } = corCelula(valor, maiorValor);
                    const label = TELAS_SISTEMA[tela]?.title || tela;
                    return (
                      <td
                        key={tela}
                        className="border-b border-l border-gray-50 p-0 text-center tabular-nums"
                        title={`${usuario.nome} — ${label}: ${valor} acesso(s)`}
                      >
                        <div className="flex h-9 items-center justify-center" style={{ background: bg, color: texto }}>
                          {valor > 0 ? valor : ''}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
