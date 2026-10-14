import { Children, cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import Icon from './Icon';

export function Button({ children, variant = 'primary', icon, className = '', disabled = false, type = 'button', ...props }) {
  const styles = {
    primary: 'bg-teal-800 text-white hover:bg-teal-900 shadow-sm',
    secondary: 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50',
    ghost: 'bg-transparent text-stone-600 hover:bg-stone-100',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
    gold: 'bg-[#a57b3e] text-white hover:bg-[#8c6936]'
  };
  return <button type={type} disabled={disabled} data-variant={variant} className={`ui-button inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`} {...props}>{icon && <Icon name={icon} size={16}/>} {children}</button>;
}

export function Card({ children, className = '', dark = false }) {
  return <section className={`ui-card rounded-2xl border shadow-sm ${dark ? 'border-teal-800/60 bg-[#102b27]' : 'border-stone-200/80 bg-white/90'} ${className}`}>{children}</section>;
}

export function Badge({ children, tone = 'neutral' }) {
  const styles = {
    neutral: 'bg-stone-100 text-stone-700 border-stone-200',
    teal: 'bg-teal-50 text-teal-800 border-teal-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    yellow: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200'
  };
  return <span className={`ui-badge inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${styles[tone]}`}>{children}</span>;
}

export function Field({ label, hint, error, children, required = false, id: providedId, htmlFor }) {
  const generatedId = useId();
  const child = Children.count(children) === 1 ? Children.only(children) : null;
  const isDirectControl = isValidElement(child) && typeof child.type === 'string' && ['input', 'select', 'textarea'].includes(child.type);
  const controlId = providedId || generatedId;
  const control = isDirectControl
    ? cloneElement(child, { id: child.props.id || controlId, 'aria-required': required ? true : child.props['aria-required'] })
    : children;
  const labelTarget = htmlFor || (isDirectControl ? controlId : undefined);
  return <div className="ui-field space-y-1.5"><label htmlFor={labelTarget} className="block text-xs font-bold uppercase tracking-[0.14em] text-stone-500">{label}{required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}</label>{control}{hint && !error && <p className="field-hint text-[11px] text-stone-400">{hint}</p>}{error && <p className="text-[11px] font-medium text-red-600">{error}</p>}</div>;
}

export const inputClass = 'ui-input w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-sm text-stone-900 outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

export function Modal({ title, onClose, children, wide = false, scrollBody = false, footer = null }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const previousFocus = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    previousFocus.current = document.activeElement;
    const dialog = dialogRef.current;
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const firstControl = dialog?.querySelector(focusableSelector);
    firstControl?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape' && onCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusables = [...dialog.querySelectorAll(focusableSelector)];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus.current instanceof HTMLElement) previousFocus.current.focus();
    };
  }, []);

  const header = (
    <div className={`ui-modal-header ${scrollBody ? 'ui-modal-header--fixed' : 'mb-5'} flex items-start justify-between gap-4`}>
      <h2 id={titleId} className="font-display text-xl font-bold text-stone-900">{title}</h2>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close dialog" className="ui-icon-button rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
          <Icon name="x" />
        </button>
      )}
    </div>
  );

  return (
    <div
      className="ui-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-sm"
      onMouseDown={event => { if (event.target === event.currentTarget && onCloseRef.current) onCloseRef.current(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`ui-modal w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl ${scrollBody ? 'ui-modal--scroll-layout' : ''}`}
      >
        {scrollBody ? (
          <>
            {header}
            <div className="ui-modal-body">{children}</div>
            {footer && <div className="ui-modal-footer">{footer}</div>}
          </>
        ) : (
          <>{header}{children}{footer}</>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, message, action }) {
  return <div className="ui-empty-state rounded-2xl border border-dashed border-stone-200 bg-stone-50 p-10 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><Icon name="info" size={22}/></div><h3 className="font-display text-base font-bold text-stone-800">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm text-stone-500">{message}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

export function Spinner() { return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-label="Loading"/>; }
