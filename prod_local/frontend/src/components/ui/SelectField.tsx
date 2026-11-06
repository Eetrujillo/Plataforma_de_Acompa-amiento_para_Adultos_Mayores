import type { SelectHTMLAttributes } from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
}

export function SelectField({
  label,
  error,
  hint,
  id,
  name,
  options,
  ...props
}: SelectFieldProps) {
  const fieldId = id ?? name ?? label.toLowerCase().replace(/\s+/g, '-');
  const describedBy =
    [hint && !error ? `${fieldId}-hint` : null, error ? `${fieldId}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className="form-field">
      <label htmlFor={fieldId}>{label}</label>
      <select
        id={fieldId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
