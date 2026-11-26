import { useEffect } from 'react';
import Modal from '../../../../components/Modal';
import { desvio, desvioPct, detalhar, percentual, reais } from './modelo';

// Detalhamento de uma célula (ou de uma linha, coluna ou total) da Gestão Matricial: os pares centro de custo ×
// conta (natureza) que compõem o desvio, do pior para o melhor, com o Projetado, o Realizado e o desvio de cada um.

const classe = (v) => (v > 0.5 ? 'bom' : v < -0.5 ? 'ruim' : '');

export default function DetalheCelula({ detalhe, M, onFechar }) {
  useEffect(() => {
    if (!detalhe) return undefined;
    const esc = (e) => e.key === 'Escape' && onFechar();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [detalhe, onFechar]);
  if (!detalhe || !M) return null;
  const { x } = detalhe;
  const linhas = detalhar(M, x.itens);
  const d = desvio(x);
  const p = desvioPct(x);
  return (
    <Modal open title={detalhe.titulo} onClose={onFechar} maxWidthClass="max-w-5xl">
      <div className="painel-cfo mx-det">
        <p className="mx-det-sub">{detalhe.subtitulo}</p>
        <div className="mx-det-resumo">
          <div>
            <span>Projetado</span>
            <b>{reais(x.p)}</b>
          </div>
          <div>
            <span>Realizado</span>
            <b>{reais(x.r)}</b>
          </div>
          <div className={classe(d)}>
            <span>Desvio</span>
            <b>{reais(d, true)}</b>
          </div>
          <div className={classe(d)}>
            <span>Desvio %</span>
            <b>{p === null ? 'sem previsto' : percentual(p)}</b>
          </div>
        </div>
        <div className="mx-det-tabela">
          <table>
            <thead>
              <tr>
                <th>Centro de custo</th>
                <th>Conta</th>
                <th className="n">Projetado</th>
                <th className="n">Realizado</th>
                <th className="n">Desvio</th>
                <th className="n">Desvio %</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const dl = l.r - l.p;
                const pl = desvioPct(l);
                return (
                  <tr key={l.chave}>
                    <td>
                      <span className="mx-det-cod">{l.centroId}</span> {l.centro}
                    </td>
                    <td>
                      <span className="mx-det-cod">{l.codigo}</span> {l.natureza}
                    </td>
                    <td className="n">{reais(l.p)}</td>
                    <td className="n">{reais(l.r)}</td>
                    <td className={`n ${classe(dl)}`}>{reais(dl, true)}</td>
                    <td className={`n ${classe(dl)}`}>{pl === null ? 's/ previsto' : percentual(pl)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mx-det-nota">
          {linhas.length} {linhas.length === 1 ? 'combinação' : 'combinações'} centro × conta · valores com o sinal do caixa (saída negativa) · desvio
          positivo = melhor para o caixa
        </p>
      </div>
    </Modal>
  );
}
