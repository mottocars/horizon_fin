import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Ban, Trash2, HelpCircle } from 'lucide-react';
import Button from '../components/Button';

const ConfirmContext = createContext(null);

const variantStyles = {
  default: {
    icon: HelpCircle,
    badge: 'bg-primary-50 text-primary-600',
    confirmVariant: 'primary',
  },
  warning: {
    icon: Ban,
    badge: 'bg-amber-50 text-amber-600',
    confirmVariant: 'danger',
  },
  danger: {
    icon: Trash2,
    badge: 'bg-red-50 text-red-600',
    confirmVariant: 'danger',
  },
};

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const [visible, setVisible] = useState(false);
  const resolverRef = useRef(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({
        title: options.title || 'Confirmar ação',
        description: options.description || '',
        confirmLabel: options.confirmLabel || (options.onlyOk ? 'Entendi' : 'Confirmar'),
        cancelLabel: options.cancelLabel || 'Cancelar',
        variant: options.variant || 'default',
        onlyOk: Boolean(options.onlyOk),
      });
      requestAnimationFrame(() => setVisible(true));
    });
  }, []);

  function settle(result) {
    setVisible(false);
    setTimeout(() => {
      setState(null);
      resolverRef.current?.(result);
      resolverRef.current = null;
    }, 150);
  }

  const config = state ? variantStyles[state.variant] : null;
  const Icon = config?.icon;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {state && (
        <div
          className={`fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-gray-900/50 p-4 transition-opacity duration-150 ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => settle(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm cursor-auto rounded-card bg-white p-6 shadow-card transition-all duration-150 ${
              visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-95 opacity-0'
            }`}
          >
            <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${config.badge}`}>
              <Icon size={22} />
            </div>

            <h2 className="text-base font-semibold text-gray-900">{state.title}</h2>
            {state.description && (
              <p className="mt-1.5 whitespace-pre-line text-sm text-gray-500">
                {state.description}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              {!state.onlyOk && (
                <Button variant="secondary" onClick={() => settle(false)}>
                  {state.cancelLabel}
                </Button>
              )}
              <Button variant={config.confirmVariant} onClick={() => settle(true)}>
                {state.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm deve ser usado dentro de ConfirmProvider');
  return ctx;
}

export function useAlert() {
  const confirm = useConfirm();
  return useCallback((options) => confirm({ ...options, onlyOk: true }), [confirm]);
}
