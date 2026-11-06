import type { InputHTMLAttributes } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function FormField({ label, error, hint, id, name, ...props }: FormFieldProps) {
  const fieldId = id ?? name ?? label.toLowerCase().replace(/\s+/g, '-');
  const describedBy =
    [hint && !error ? `${fieldId}-hint` : null, error ? `${fieldId}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className="form-field">
      <label htmlFor={fieldId}>{label}</label>
      <input
        id={fieldId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {hint && !error ? (
        <span id={`${fieldId}-hint`} className="form-hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${fieldId}-error`} className="form-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
