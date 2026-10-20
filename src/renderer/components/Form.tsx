import type { FormEvent, ReactNode } from 'react';

interface FormProps {
  /** Runs on Enter or the submit button; the page never reloads. */
  onSubmit: () => void;
  className?: string | undefined;
  children: ReactNode;
}

/** A form that submits with Enter and shows our own plain messages instead of the browser's. */
export function Form({ onSubmit, className, children }: FormProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form className={className} onSubmit={submit} noValidate>
      {children}
    </form>
  );
}
