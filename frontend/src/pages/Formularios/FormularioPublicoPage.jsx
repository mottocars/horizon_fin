import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarClock, CheckCircle2, FileQuestion, Lock } from 'lucide-react';
import { obterFormularioPublico, responderFormularioPublico } from '../../api/formularios.api';
import FormularioResponder from './FormularioResponder';
import { corAlpha, dataBr } from './tipos';
import './formularios.css';

const chaveRespondido = (token) => `horizon_formulario_respondido_${token}`;

function lerRespondido(token) {
  try {
    return localStorage.getItem(chaveRespondido(token)) === '1';
  } catch {
    return false;
  }
}

// Link público de um formulário (/f/:token) — fora do login do sistema. "Uma resposta por pessoa" é controlado
// pelo navegador (localStorage): quem já respondeu vê o aviso em vez do formulário.
export default function FormularioPublicoPage() {
  const { token } = useParams();
  const [form, setForm] = useState(null);
  const [erro, setErro] = useState('');
  const [jaRespondido, setJaRespondido] = useState(() => lerRespondido(token));
  const isca = useRef(null);

  useEffect(() => {
    obterFormularioPublico(token)
      .then((f) => {
        setForm(f);
        document.title = f.titulo || 'Formulário';
      })
      .catch((e) =>
        setErro(
          e?.response?.status === 404
            ? 'NAO_ENCONTRADO'
            : e?.response?.data?.message || 'Não foi possível abrir o formulário. Verifique a conexão e tente de novo.'
        )
      );
  }, [token]);

  const cor = form?.cor_tema || '#2563eb';

  async function enviar(respostas) {
    await responderFormularioPublico(token, respostas, isca.current?.value || '');
    if (form.uma_resposta_por_pessoa) {
      try {
        localStorage.setItem(chaveRespondido(token), '1');
      } catch {
        // navegador sem armazenamento: só não lembra
      }
    }
  }

  let conteudo;
  if (erro) {
    conteudo =
      erro === 'NAO_ENCONTRADO' ? (
        <Aviso icone={FileQuestion} cor={cor} titulo="Formulário não encontrado" texto="O link pode estar incompleto ou o formulário foi retirado do ar. Confira o endereço com quem enviou." />
      ) : (
        <Aviso icone={FileQuestion} cor={cor} titulo="Algo deu errado" texto={erro} />
      );
  } else if (!form) {
    conteudo = (
      <div className="flex justify-center py-24">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-primary-600" />
      </div>
    );
  } else if (form.indisponivel === 'NAO_INICIADO') {
    conteudo = (
      <Aviso icone={CalendarClock} cor={cor} titulo={form.titulo} texto={`Este formulário começa a aceitar respostas em ${dataBr(form.inicio_em)}. Volte a partir dessa data.`} />
    );
  } else if (form.indisponivel) {
    conteudo = <Aviso icone={Lock} cor={cor} titulo={form.titulo} texto="Este formulário não está mais aceitando respostas. Obrigado pelo interesse!" />;
  } else if (jaRespondido && form.uma_resposta_por_pessoa) {
    conteudo = (
      <Aviso icone={CheckCircle2} cor={cor} titulo={form.titulo} texto="Você já respondeu este formulário. Obrigado pela participação!">
        <button type="button" onClick={() => setJaRespondido(false)} className="mt-5 text-xs font-medium text-gray-400 hover:text-gray-600 hover:underline">
          Não fui eu — responder mesmo assim
        </button>
      </Aviso>
    );
  } else {
    conteudo = <FormularioResponder formulario={form} onEnviar={enviar} />;
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:py-12" style={{ backgroundColor: '#fff', backgroundImage: `linear-gradient(${form ? corAlpha(cor, 0.08) : 'rgba(0,0,0,0.03)'}, ${form ? corAlpha(cor, 0.08) : 'rgba(0,0,0,0.03)'})` }}>
      {/* Campo-isca: invisível para pessoas; robô que preenche tudo é descartado no servidor. */}
      <input ref={isca} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      {conteudo}
      <p className="mt-10 text-center text-xs text-gray-400">
        Formulário criado com <img src="/logomarca.svg" alt="Horizon Fin" className="ml-1 inline h-3.5 w-auto align-[-2px] opacity-70" />
      </p>
    </div>
  );
}

function Aviso({ icone: Icone, cor, titulo, texto, children }) {
  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="h-2.5" style={{ backgroundColor: cor }} />
      <div className="flex flex-col items-center px-8 py-12 text-center">
        <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: corAlpha(cor, 0.12), color: cor }}>
          <Icone size={28} />
        </span>
        <h1 className="text-xl font-semibold text-gray-900">{titulo}</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-600">{texto}</p>
        {children}
      </div>
    </div>
  );
}
