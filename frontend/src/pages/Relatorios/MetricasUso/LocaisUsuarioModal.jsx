import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Globe2, MapPin } from 'lucide-react';
import Modal from '../../../components/Modal';
import { getLocaisUsuario } from '../../../api/logsAcesso.api';
import { BadgeTipo, formatarDataHora, nomePais } from './tiposCliente';
import MapaLocais from './MapaLocais';

// Drilldown "Onde acessou" de 1 usuário (clique no nome em "Como cada
// usuário acessa"): cada IP do período com cidade, provedor, quando
// apareceu/sumiu e por qual cliente, e o mapa com os locais na ordem em que
// apareceram. A localização vem do IP (ver backend/src/utils/geoIp.js):
// é de cidade, nunca o endereço.

// As bases trazem o estado por extenso e sem acento ("Sao Paulo", "Federal
// District") — no Brasil mostra a sigla.
const UF = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE', 'federal district': 'DF',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA', 'mato grosso': 'MT',
  'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA', paraiba: 'PB', parana: 'PR', pernambuco: 'PE',
  piaui: 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO',
  roraima: 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};

function semAcento(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function rotuloLocal({ cidade, estado, pais }) {
  const uf = pais === 'BR' ? UF[semAcento(estado)] || estado : estado;
  const partes = [cidade, uf].filter(Boolean).join('/');
  if (pais === 'BR') return partes || 'Brasil';
  return [partes, nomePais(pais)].filter(Boolean).join(' · ') || 'Local desconhecido';
}

function temCoordenadas(local) {
  return local && local.latitude != null && local.longitude != null;
}

// Agrupa os IPs por local (mesmas coordenadas = mesma cidade) e numera os
// locais na ordem em que apareceram no período.
function montarLocais(ips) {
  const porChave = new Map();
  for (const item of ips) {
    if (!temCoordenadas(item.local)) continue;
    const chave = `${item.local.latitude.toFixed(3)},${item.local.longitude.toFixed(3)}`;
    if (!porChave.has(chave)) porChave.set(chave, { chave, local: item.local, ips: [] });
    porChave.get(chave).ips.push(item);
  }
  const grupos = [...porChave.values()].map((g) => ({
    ...g,
    primeiro: g.ips.reduce((min, i) => (i.primeiro_em < min ? i.primeiro_em : min), g.ips[0].primeiro_em),
    ultimo: g.ips.reduce((max, i) => (i.ultimo_em > max ? i.ultimo_em : max), g.ips[0].ultimo_em),
  }));
  grupos.sort((a, b) => (a.primeiro < b.primeiro ? -1 : 1));
  return grupos.map((g, i) => ({
    chave: g.chave,
    numero: i + 1,
    latitude: g.local.latitude,
    longitude: g.local.longitude,
    exterior: g.local.pais && g.local.pais !== 'BR',
    titulo: rotuloLocal(g.local),
    linhas: [
      ...g.ips.map((ip) => `${ip.ip}${ip.local.provedor ? ` · ${ip.local.provedor}` : ''}`),
      `De ${formatarDataHora(g.primeiro)} a ${formatarDataHora(g.ultimo)}`,
    ],
    alternativa: g.local.alternativa ? { ...g.local.alternativa, rotulo: rotuloLocal(g.local.alternativa) } : null,
  }));
}

function chaveDoIp(item) {
  return temCoordenadas(item.local) ? `${item.local.latitude.toFixed(3)},${item.local.longitude.toFixed(3)}` : null;
}

// Dia a dia do período (só os dias com acesso): em quais locais o usuário
// estava — é aqui que se vê o IP mudando de cidade.
function montarLinhaDoTempo(ips, numeroPorChave) {
  const porDia = new Map();
  for (const item of ips) {
    const chave = chaveDoIp(item);
    for (const dia of item.dias) {
      if (!porDia.has(dia)) porDia.set(dia, new Map());
      const nome = chave ? chave : item.local?.privado ? 'interna' : 'desconhecido';
      porDia.get(dia).set(nome, chave ? numeroPorChave.get(chave) : null);
    }
  }
  return [...porDia.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dia, mapa]) => ({
      dia,
      locais: [...mapa.entries()]
        .map(([chave, local]) => ({ chave, local }))
        .sort((a, b) => (a.local?.numero ?? 99) - (b.local?.numero ?? 99)),
    }));
}

function formatarDia(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

export default function LocaisUsuarioModal({ usuario, periodo, onClose }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [selecionado, setSelecionado] = useState(null);

  useEffect(() => {
    if (!usuario) return undefined;
    let ativo = true;
    setDados(null);
    setErro(null);
    setSelecionado(null);
    getLocaisUsuario(usuario.id, periodo || {})
      .then((resultado) => ativo && setDados(resultado))
      .catch(() => ativo && setErro('Não foi possível carregar os locais de acesso.'));
    return () => {
      ativo = false;
    };
  }, [usuario, periodo]);

  const locais = useMemo(() => (dados ? montarLocais(dados.ips) : []), [dados]);
  const numeroPorChave = useMemo(() => new Map(locais.map((l) => [l.chave, l])), [locais]);
  const linhaDoTempo = useMemo(() => (dados ? montarLinhaDoTempo(dados.ips, numeroPorChave) : []), [dados, numeroPorChave]);

  if (!usuario) return null;

  const ips = dados?.ips || [];
  const semLocal = ips.filter((i) => !temCoordenadas(i.local));

  return (
    <Modal open title={`Onde ${usuario.nome} acessou`} onClose={onClose} maxWidthClass="max-w-6xl" maxHeightClass="max-h-[92vh]">
      {erro ? (
        <p className="py-10 text-center text-sm text-red-600">{erro}</p>
      ) : !dados ? (
        <p className="py-10 text-center text-sm text-gray-400">Localizando os acessos...</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
            <span>
              Período: <strong>{formatarDia(dados.periodo.dataInicio)}</strong> a <strong>{formatarDia(dados.periodo.dataFim)}</strong>
            </span>
            <span>
              <strong>{ips.length}</strong> {ips.length === 1 ? 'endereço (IP)' : 'endereços (IPs)'} em{' '}
              <strong>{locais.length}</strong> {locais.length === 1 ? 'local' : 'locais'}
            </span>
            {locais.some((l) => l.exterior) && (
              <span className="inline-flex items-center gap-1 font-medium text-red-700">
                <Globe2 size={13} /> Acesso de fora do Brasil
              </span>
            )}
          </div>

          {locais.length > 0 ? (
            <div className="h-[380px] overflow-hidden rounded-lg border border-gray-100">
              <MapaLocais locais={locais} selecionado={selecionado} onSelecionar={setSelecionado} />
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
              Nenhum acesso com localização no período (só rede interna ou IP desconhecido).
            </div>
          )}

          {linhaDoTempo.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-700">Dia a dia</p>
              <div className="flex max-h-[96px] flex-wrap gap-1.5 overflow-y-auto">
                {linhaDoTempo.map(({ dia, locais: doDia }, i) => {
                  const anterior = linhaDoTempo[i - 1];
                  const mudou = anterior && anterior.locais.map((l) => l.chave).join() !== doDia.map((l) => l.chave).join();
                  return (
                    <div
                      key={dia}
                      className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] ${
                        mudou ? 'border-amber-300 bg-amber-50' : 'border-gray-100 bg-gray-50'
                      }`}
                      title={mudou ? 'Local diferente do dia anterior com acesso' : undefined}
                    >
                      <span className="text-gray-500">{formatarDia(dia).slice(0, 5)}</span>
                      {doDia.map(({ chave, local }) =>
                        local ? (
                          <button
                            key={chave}
                            type="button"
                            onClick={() => setSelecionado(chave)}
                            title={local.titulo}
                            className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white ${
                              local.exterior ? 'bg-red-600' : 'bg-primary-600'
                            }`}
                          >
                            {local.numero}
                          </button>
                        ) : (
                          <span key={chave} className="text-gray-400" title={chave === 'interna' ? 'Rede interna' : 'Local desconhecido'}>
                            —
                          </span>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {ips.length > 0 && (
            <div className="max-h-[320px] overflow-auto rounded-lg border border-gray-100">
              <table className="w-full min-w-[980px] border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className="text-left text-gray-500">
                    {['Local', 'IP', 'Provedor', 'Primeiro acesso', 'Último acesso', 'Dias', 'Requisições', 'Como acessou'].map((titulo) => (
                      <th
                        key={titulo}
                        className={`sticky top-0 z-10 border-b border-gray-100 bg-white px-3 py-2 font-medium ${
                          titulo === 'Dias' || titulo === 'Requisições' ? 'text-right' : ''
                        }`}
                      >
                        {titulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ips.map((item) => {
                    const chave = chaveDoIp(item);
                    const local = chave ? numeroPorChave.get(chave) : null;
                    const ativo = chave && chave === selecionado;
                    return (
                      <tr
                        key={item.ip}
                        onClick={() => chave && setSelecionado(chave)}
                        className={`align-top ${chave ? 'cursor-pointer hover:bg-gray-50' : ''} ${ativo ? 'bg-primary-50' : ''}`}
                      >
                        <td className="border-b border-gray-100 px-3 py-2">
                          {local ? (
                            <div className="flex items-start gap-2">
                              <span
                                className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${
                                  local.exterior ? 'bg-red-600' : 'bg-primary-600'
                                }`}
                              >
                                {local.numero}
                              </span>
                              <div>
                                <p className={`font-medium ${local.exterior ? 'text-red-700' : 'text-gray-800'}`}>{local.titulo}</p>
                                {local.alternativa && (
                                  <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-amber-700">
                                    <AlertTriangle size={11} />
                                    Outra base indica {local.alternativa.rotulo} ({local.alternativa.distanciaKm.toLocaleString('pt-BR')} km)
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-gray-500">
                              <MapPin size={12} className="text-gray-300" />
                              {item.local?.privado ? 'Rede interna' : 'Local desconhecido'}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2 font-mono text-[11px] text-gray-600">{item.ip}</td>
                        <td className="max-w-[200px] border-b border-gray-100 px-3 py-2 text-gray-600" title={item.local?.asn ? `AS${item.local.asn}` : undefined}>
                          {item.local?.provedor || '—'}
                        </td>
                        <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2 text-gray-500">{formatarDataHora(item.primeiro_em)}</td>
                        <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2 text-gray-500">{formatarDataHora(item.ultimo_em)}</td>
                        <td
                          className="border-b border-gray-100 px-3 py-2 text-right tabular-nums text-gray-500"
                          title={item.dias.map(formatarDia).join(', ')}
                        >
                          {item.dias.length}
                        </td>
                        <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums text-gray-700">
                          {item.requisicoes.toLocaleString('pt-BR')}
                        </td>
                        <td className="border-b border-gray-100 px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {item.clientes.map((c) => (
                              <span key={`${c.tipo}|${c.detalhe}`} title={c.detalhe || undefined}>
                                <BadgeTipo tipo={c.tipo} />
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-gray-400">
            A localização vem do endereço IP e é aproximada: mostra a cidade (o círculo no mapa), às vezes a cidade da central do
            provedor — em rede de celular costuma cair na capital. VPN mostra o local do servidor da VPN.
            {semLocal.length > 0 && ` ${semLocal.length} ${semLocal.length === 1 ? 'IP sem' : 'IPs sem'} localização (rede interna ou desconhecido).`}{' '}
            Bases:{' '}
            <a href="https://db-ip.com" target="_blank" rel="noreferrer" className="underline">
              IP Geolocation by DB-IP
            </a>{' '}
            e GeoLite2 (dados criados pela{' '}
            <a href="https://www.maxmind.com" target="_blank" rel="noreferrer" className="underline">
              MaxMind
            </a>
            ).
          </p>
        </div>
      )}
    </Modal>
  );
}
