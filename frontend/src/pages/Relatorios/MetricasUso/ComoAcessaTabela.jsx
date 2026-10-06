import { Fragment, useMemo } from 'react';
import { AlertTriangle, Bot, Globe2, HelpCircle, Monitor, ShieldAlert, Smartphone, Terminal } from 'lucide-react';
import Card from '../../../components/Card';

// Tipos gravados pelo backend (ver backend/src/utils/clienteHttp.js).
// `suspeito` = não é o sistema aberto num navegador de verdade — alguém
// chamando a API por fora (Postman, script...) com o login de um usuário.
const TIPOS = {
  navegador: { label: 'Navegador', icone: Monitor, cor: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  celular: { label: 'Celular', icone: Smartphone, cor: 'border-sky-200 bg-sky-50 text-sky-700' },
  imitando_navegador: {
    label: 'Imitando navegador',
    icone: AlertTriangle,
    cor: 'border-amber-200 bg-amber-50 text-amber-700',
    suspeito: true,
    dica: 'Se apresenta como navegador, mas não envia os cabeçalhos que todo navegador envia sozinho — típico de script.',
  },
  navegador_automatizado: { label: 'Navegador automatizado', icone: Bot, cor: 'border-red-200 bg-red-50 text-red-700', suspeito: true },
  postman: { label: 'Postman', icone: Terminal, cor: 'border-red-200 bg-red-50 text-red-700', suspeito: true },
  insomnia: { label: 'Insomnia', icone: Terminal, cor: 'border-red-200 bg-red-50 text-red-700', suspeito: true },
  python: { label: 'Script Python', icone: Terminal, cor: 'border-red-200 bg-red-50 text-red-700', suspeito: true },
  curl: { label: 'curl', icone: Terminal, cor: 'border-red-200 bg-red-50 text-red-700', suspeito: true },
  node: { label: 'Script Node.js', icone: Terminal, cor: 'border-red-200 bg-red-50 text-red-700', suspeito: true },
  script: { label: 'Outro programa', icone: Terminal, cor: 'border-red-200 bg-red-50 text-red-700', suspeito: true },
  desconhecido: { label: 'Desconhecido', icone: HelpCircle, cor: 'border-gray-200 bg-gray-50 text-gray-600', suspeito: true },
};

// País vem do backend como código ISO ("BR", "US"...) — calculado pelo IP
// (ver backend/src/utils/paisDoIp.js). 'LOCAL' = rede interna.
const nomesRegioes = new Intl.DisplayNames(['pt-BR'], { type: 'region' });

function nomePais(codigo) {
  if (codigo === 'LOCAL') return 'Rede interna';
  try {
    return nomesRegioes.of(codigo) || codigo;
  } catch {
    return codigo;
  }
}

function ehExterior(codigo) {
  return codigo !== 'BR' && codigo !== 'LOCAL';
}

function Pais({ codigo }) {
  const exterior = ehExterior(codigo);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${exterior ? 'font-medium text-red-700' : 'text-gray-600'}`}>
      {codigo === 'LOCAL' ? (
        <Globe2 size={12} className="text-gray-400" />
      ) : (
        <span
          className={`rounded px-1 py-px font-mono text-[10px] font-semibold ${
            exterior ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {codigo}
        </span>
      )}
      {nomePais(codigo)}
    </span>
  );
}

function formatarDataHora(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function BadgeTipo({ tipo }) {
  const info = TIPOS[tipo] || TIPOS.desconhecido;
  const Icone = info.icone;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${info.cor}`}
      title={info.dica}
    >
      <Icone size={12} />
      {info.label}
    </span>
  );
}

export default function ComoAcessaTabela({ clientes }) {
  // Agrupa por usuário (o backend já manda ordenado por nome e, dentro de
  // cada usuário, por quantidade de requisições).
  const { grupos, usuariosSuspeitos, usuariosExterior } = useMemo(() => {
    const porUsuario = new Map();
    for (const c of clientes) {
      if (!porUsuario.has(c.usuario_id)) porUsuario.set(c.usuario_id, { id: c.usuario_id, nome: c.usuario_nome, linhas: [] });
      porUsuario.get(c.usuario_id).linhas.push(c);
    }
    const lista = [...porUsuario.values()];
    const suspeitos = lista.filter((g) => g.linhas.some((l) => (TIPOS[l.tipo] || TIPOS.desconhecido).suspeito));
    const exterior = lista.filter((g) => g.linhas.some((l) => (l.paises || []).some(ehExterior)));
    return { grupos: lista, usuariosSuspeitos: suspeitos, usuariosExterior: exterior };
  }, [clientes]);

  return (
    <Card>
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Como cada usuário acessa</h2>
        <p className="text-xs text-gray-500">
          De onde vieram as chamadas ao sistema no período — navegador, celular ou programas como Postman e scripts.
        </p>
      </div>

      {usuariosSuspeitos.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          <span>
            {usuariosSuspeitos.length === 1 ? '1 usuário acessou' : `${usuariosSuspeitos.length} usuários acessaram`} o sistema por
            fora do navegador: <strong>{usuariosSuspeitos.map((g) => g.nome).join(', ')}</strong>.
          </span>
        </div>
      )}

      {usuariosExterior.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <Globe2 size={15} className="mt-0.5 shrink-0" />
          <span>
            {usuariosExterior.length === 1 ? '1 usuário acessou' : `${usuariosExterior.length} usuários acessaram`} de fora do
            Brasil: <strong>{usuariosExterior.map((g) => g.nome).join(', ')}</strong>. Pode ser VPN, servidor no exterior ou
            login vazado.
          </span>
        </div>
      )}

      {grupos.length === 0 ? (
        <p className="mt-6 py-6 text-center text-sm text-gray-400">Sem acessos registrados nesse período.</p>
      ) : (
        <div className="mt-4 max-h-[520px] overflow-auto rounded-lg border border-gray-100">
          <table className="w-full min-w-[860px] border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                {['Usuário', 'Como acessa', 'Detalhe', 'Requisições', 'Dias', 'País', 'IP', 'Último acesso'].map((titulo, i) => (
                  <th
                    key={titulo}
                    className={`sticky top-0 z-10 border-b border-gray-100 bg-white px-3 py-2 font-medium ${i >= 3 && i <= 4 ? 'text-right' : ''}`}
                  >
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((grupo) => (
                <Fragment key={grupo.id}>
                  {grupo.linhas.map((linha, i) => {
                    const ultima = i === grupo.linhas.length - 1;
                    const borda = ultima ? 'border-b border-gray-100' : '';
                    return (
                      <tr key={`${linha.tipo}|${linha.detalhe}`} className="align-middle">
                        {i === 0 && (
                          <td
                            rowSpan={grupo.linhas.length}
                            className="max-w-[180px] truncate border-b border-gray-100 px-3 py-2 align-top font-medium text-gray-700"
                            title={grupo.nome}
                          >
                            {grupo.nome}
                          </td>
                        )}
                        <td className={`px-3 py-2 ${borda}`}>
                          <BadgeTipo tipo={linha.tipo} />
                        </td>
                        <td className={`max-w-[240px] truncate px-3 py-2 text-gray-600 ${borda}`} title={linha.user_agent || undefined}>
                          {linha.detalhe || '—'}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums text-gray-700 ${borda}`}>
                          {linha.requisicoes.toLocaleString('pt-BR')}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums text-gray-500 ${borda}`}>{linha.dias}</td>
                        <td className={`px-3 py-2 ${borda}`}>
                          {(linha.paises || []).length === 0 ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {linha.paises.map((codigo) => (
                                <Pais key={codigo} codigo={codigo} />
                              ))}
                            </div>
                          )}
                        </td>
                        <td
                          className={`max-w-[160px] truncate px-3 py-2 font-mono text-[11px] text-gray-500 ${borda}`}
                          title={(linha.ips || []).map((i) => `${i.ip}${i.pais ? ` (${nomePais(i.pais)})` : ''}`).join(', ')}
                        >
                          {(linha.ips || []).length === 0
                            ? '—'
                            : linha.ips.length === 1
                              ? linha.ips[0].ip
                              : `${linha.ips[0].ip} +${linha.ips.length - 1}`}
                        </td>
                        <td className={`whitespace-nowrap px-3 py-2 text-gray-500 ${borda}`}>{formatarDataHora(linha.ultimo_em)}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
