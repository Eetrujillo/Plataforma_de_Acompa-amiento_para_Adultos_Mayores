/**
 * Warm illustration for the login card: the hugging grandparents 3D render
 * provided by the product owner, served from /public. Kept as its own
 * component so the screen stays decoupled from the asset.
 */
export function LoginIllustration() {
  return (
    <img
      className="login__illustration-image"
      src="/abuelitos-abrazados.jpeg"
      alt="Ilustración de una pareja de abuelitos abrazados, sonriendo con lentes y un corazón"
      width="640"
      height="448"
      loading="eager"
    />
  );
}
