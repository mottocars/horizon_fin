import { useCallback, useEffect, useRef, useState } from 'react';
import { Landmark, Loader2, Search, Upload, X } from 'lucide-react';
import { listBancosCadastro, removerLogoBanco, salvarLogoBanco } from '../../../api/bancos.api';
import { redimensionarLogoBanco } from '../../../utils/imagemLogoBanco';
import { useConfirm } from '../../../confirm/ConfirmContext';

// A imagem já é redimensionada no navegador antes de enviar (ver imagemLogoBanco.js) — este
// limite é só pra recusar um arquivo absurdamente grande antes mesmo de tentar processar.
const TAMANHO_MAXIMO_ARQUIVO = 8 * 1024 * 1024;

// Logo oficial vem de um CDN externo (BrasilAPI) — se ela falhar ao carregar (rede, CDN fora
// do ar), cai pro ícone neutro em vez de deixar uma caixa quebrada/em branco pra sempre. Não
// reaproveita LogoBanco.jsx (usado na matriz de Saldos das Contas): lá, sem imagem ele mostra
// o CÓDIGO do banco como texto — nesta tabela isso duplicaria a própria coluna "Código", que
// já fica do lado.
function LogoCelula({ logo, nome }) {
  const [falhou, setFalhou] = useState(false);
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-50 ring-1 ring-gray-200">
      {logo && !falhou ? (
        <img
          src={logo}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFalhou(true)}
          className="h-6 w-6 object-contain"
        />
      ) : (
        <Landmark size={15} className="text-gray-300" aria-label={`${nome}: sem logomarca`} />
      )}
    </div>
  );
}

// Cadastro dos bancos brasileiros (BrasilAPI + o interno "Movimento Interno" — ver
// bancos-api.client.js), com upload de logomarca por banco. A logo enviada aqui sobrepõe a
// oficial em qualquer lugar do sistema que mostre a logo de um banco (ex.: a matriz da aba
// Saldos das Contas), na hora — sem precisar de deploy nem esperar cache nenhum vencer.
export default function BancosTab() {
  const confirm = useConfirm();
  const [bancos, setBancos] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [processandoCodigo, setProcessandoCodigo] = useState(null);
  const [erroPorCodigo, setErroPorCodigo] = useState({});

  const fileInputRef = useRef(null);
  const codigoAlvoRef = useRef(null);

  const carregar = useCallback(async (searchTerm) => {
    setLoading(true);
    try {
      const result = await listBancosCadastro({ search: searchTerm });
      setBancos(result.data);
      setTotal(result.pagination.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => carregar(search), 300);
    return () => clearTimeout(timeout);
  }, [search, carregar]);

  function marcarErro(codigo, mensagem) {
    setErroPorCodigo((prev) => ({ ...prev, [codigo]: mensagem }));
  }

  function abrirSeletor(codigo) {
    codigoAlvoRef.current = codigo;
    marcarErro(codigo, '');
    fileInputRef.current?.click();
  }

  async function handleArquivoSelecionado(e) {
    const file = e.target.files?.[0];
    const codigo = codigoAlvoRef.current;
    e.target.value = ''; // permite escolher o mesmo arquivo de novo se quiser
    if (!file || !codigo) return;

    if (!file.type.startsWith('image/')) {
      marcarErro(codigo, 'Selecione um arquivo de imagem.');
      return;
    }
    if (file.size > TAMANHO_MAXIMO_ARQUIVO) {
      marcarErro(codigo, 'Arquivo muito grande (máx. 8MB).');
      return;
    }

    setProcessandoCodigo(codigo);
    try {
      const dataUrl = await redimensionarLogoBanco(file);
      await salvarLogoBanco(codigo, dataUrl);
      setBancos((prev) =>
        prev.map((b) => (b.codigo === codigo ? { ...b, logo: dataUrl, logo_customizada: true } : b))
      );
    } catch (err) {
      marcarErro(codigo, err.response?.data?.message || 'Não foi possível enviar essa imagem.');
    } finally {
      setProcessandoCodigo(null);
    }
  }

  async function handleRemover(banco) {
    const confirmado = await confirm({
      title: 'Remover logomarca',
      description: `Remover a logomarca enviada para "${banco.codigo} - ${banco.nome}"?`,
      confirmLabel: 'Remover',
      variant: 'warning',
    });
    if (!confirmado) return;

    setProcessandoCodigo(banco.codigo);
    marcarErro(banco.codigo, '');
    try {
      await removerLogoBanco(banco.codigo);
      // Recarrega em vez de só limpar localmente: se a BrasilAPI tiver uma logo oficial
      // pra esse código, ela precisa reaparecer no lugar da customizada removida.
      await carregar(search);
    } finally {
      setProcessandoCodigo(null);
    }
  }

  return (
    <div className="rounded-card rounded-tl-none bg-white shadow-card">
      <div className="flex flex-col gap-3 p-5 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Bancos</h2>
          <p className="text-xs text-gray-500">
            {loading && bancos.length === 0
              ? 'Carregando...'
              : `${total} banco${total === 1 ? '' : 's'} brasileiro${total === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código ou nome..."
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
      </div>

      {/* Um único input de arquivo compartilhado por todas as linhas — abrirSeletor() marca
          qual código está "no alvo" antes de disparar o clique nele. */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleArquivoSelecionado} className="hidden" />

      <div className="border-t border-gray-100 px-5 pb-5">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : bancos.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-gray-400">
            <Landmark size={28} className="text-gray-300" />
            Nenhum banco encontrado.
          </div>
        ) : (
          // Sem paginação, a tabela pode passar de 400 linhas — cabeçalho grudado no topo
          // (relativo ao <main>, que é quem rola a página) pra não perder as colunas de vista
          // ao descer.
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-gray-400">
                <th className="sticky top-0 z-10 w-20 border-b border-gray-100 bg-white py-3 font-medium">Código</th>
                <th className="sticky top-0 z-10 w-16 border-b border-gray-100 bg-white py-3 font-medium">Logo</th>
                <th className="sticky top-0 z-10 border-b border-gray-100 bg-white py-3 font-medium">Nome</th>
                <th className="sticky top-0 z-10 w-44 border-b border-gray-100 bg-white py-3 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {bancos.map((banco) => {
                const processando = processandoCodigo === banco.codigo;
                return (
                  <tr key={banco.codigo} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 font-mono text-xs tabular-nums text-gray-500">{banco.codigo}</td>
                    <td className="py-2.5">
                      <LogoCelula logo={banco.logo} nome={banco.nome} />
                    </td>
                    <td className="py-2.5 text-gray-800">
                      <div className="flex items-center gap-2">
                        {banco.nome}
                        {banco.logo_customizada && (
                          <span
                            title="Logomarca enviada por você — sobrepõe a oficial"
                            className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-600"
                          >
                            Personalizada
                          </span>
                        )}
                      </div>
                      {erroPorCodigo[banco.codigo] && (
                        <p className="mt-0.5 text-xs text-red-600">{erroPorCodigo[banco.codigo]}</p>
                      )}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        {processando ? (
                          <Loader2 size={16} className="animate-spin text-gray-400" />
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => abrirSeletor(banco.codigo)}
                              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                            >
                              <Upload size={13} />
                              {banco.logo_customizada ? 'Trocar' : 'Enviar'}
                            </button>
                            {banco.logo_customizada && (
                              <button
                                type="button"
                                onClick={() => handleRemover(banco)}
                                title="Remover logomarca enviada"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
