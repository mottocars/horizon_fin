import { Fragment, useMemo, useState } from 'react';
import { Globe2, MapPin, ShieldAlert } from 'lucide-react';
import Card from '../../../components/Card';
import { TIPOS, BadgeTipo, Pais, ehExterior, formatarDataHora, nomePais } from './tiposCliente';
import LocaisUsuarioModal from './LocaisUsuarioModal';

export default function ComoAcessaTabela({ clientes, periodo }) {
  // Drilldown "Onde acessou": usuário clicado ({ id, nome }) ou null.
  const [usuarioAberto, setUsuarioAberto] = useState(null);
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
          De onde vieram as chamadas ao sistema no período — navegador, celular ou programas como Postman e scripts. Clique
          no usuário para ver no mapa de onde ele acessou.
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
                          <td rowSpan={grupo.linhas.length} className="max-w-[180px] border-b border-gray-100 px-3 py-2 align-top">
                            <button
                              type="button"
                              onClick={() => setUsuarioAberto({ id: grupo.id, nome: grupo.nome })}
                              className="group flex max-w-full items-center gap-1.5 text-left font-medium text-gray-700 hover:text-primary-600"
                              title={`Ver no mapa de onde ${grupo.nome} acessou`}
                            >
                              <span className="truncate">{grupo.nome}</span>
                              <MapPin size={12} className="shrink-0 text-gray-300 group-hover:text-primary-600" />
                            </button>
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

      <LocaisUsuarioModal usuario={usuarioAberto} periodo={periodo} onClose={() => setUsuarioAberto(null)} />
    </Card>
  );
}
