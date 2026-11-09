export function PrimaryButton({ variant = 'primary', block = false, className = '', ...props }) {
  const classes = ['button'];

  if (variant !== 'primary') {
    classes.push(`button--${variant}`);
  }

  if (block) {
    classes.push('button--block');
  }

  if (className) {
    classes.push(className);
  }

  return <button type="button" className={classes.join(' ')} {...props} />;
}
