import { useId, useLayoutEffect, type ComponentProps, type RefObject } from 'react';
import './password-field.css';

type Props = Omit<ComponentProps<'input'>, 'type' | 'ref' | 'id'> & {
  label: string;
  inputRef: RefObject<HTMLInputElement | null>;
  visible: boolean;
  toggle: () => void;
};

export function PasswordField({ label, inputRef, visible, toggle, ...inputProps }: Props) {
  const id = useId();
  useLayoutEffect(() => {
    const input = inputRef.current;
    return () => { if (input) { input.type = 'password'; input.value = ''; } };
  }, [inputRef]);
  function toggleVisibility() {
    const input = inputRef.current;
    // Keep the same uncontrolled input and its selection when changing type.
    if (input) {
      const { selectionStart, selectionEnd, selectionDirection } = input;
      input.type = visible ? 'password' : 'text';
      if (selectionStart !== null && selectionEnd !== null)
        input.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined);
    }
    toggle();
  }
  return <div className="password-field">
    <label htmlFor={id}>{label}</label>
    <div className="password-control">
      <input {...inputProps} id={id} ref={inputRef} type={visible ? 'text' : 'password'}/>
      <button type="button" onClick={toggleVisibility} disabled={inputProps.disabled} aria-controls={id} aria-pressed={visible} aria-label={`${label} ${visible ? 'verbergen' : 'tonen'}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {visible ? <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></> : <><path d="m3 3 18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3 4M6.3 6.3A20 20 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.7-1.7M9.9 9.9a3 3 0 0 0 4.2 4.2"/></>}
        </svg>
      </button>
    </div>
  </div>;
}
