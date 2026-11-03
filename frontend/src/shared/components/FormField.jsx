export function FormField({ id, label, hint, ...inputProps }) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <p className="muted" id={hintId}>
          {hint}
        </p>
      ) : null}
      <input
        className="field__input"
        id={id}
        name={id}
        aria-describedby={hintId}
        {...inputProps}
      />
    </div>
  );
}
