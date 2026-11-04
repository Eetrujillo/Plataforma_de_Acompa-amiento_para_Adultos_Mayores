/**
 * Custom illustration for the login card: an older couple with grey hair,
 * glasses and a warm smile, one slightly behind the other, framed by leaves
 * and a small heart bubble. Drawn from scratch as inline SVG (no external art).
 */
export function LoginIllustration() {
  return (
    <svg
      className="login__illustration-svg"
      viewBox="0 0 320 210"
      role="img"
      aria-label="Ilustración de una pareja mayor sonriendo, con lentes y cabello gris"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Decorative leaves, left */}
      <g fill="var(--color-login-leaf)" opacity="0.85">
        <ellipse cx="26" cy="128" rx="13" ry="30" transform="rotate(-24 26 128)" />
        <ellipse cx="48" cy="150" rx="11" ry="26" transform="rotate(-8 48 150)" />
        <ellipse cx="20" cy="164" rx="10" ry="24" transform="rotate(14 20 164)" />
      </g>
      {/* Decorative leaves, right */}
      <g fill="var(--color-login-leaf)" opacity="0.85">
        <ellipse cx="292" cy="120" rx="13" ry="30" transform="rotate(22 292 120)" />
        <ellipse cx="272" cy="146" rx="11" ry="26" transform="rotate(10 272 146)" />
        <ellipse cx="300" cy="160" rx="10" ry="24" transform="rotate(-12 300 160)" />
      </g>

      {/* Heart bubble */}
      <g>
        <circle cx="256" cy="44" r="27" fill="var(--color-surface)" />
        <path
          d="M256 56c-9-6-14-11-14-16a7 7 0 0 1 14-2 7 7 0 0 1 14 2c0 5-5 10-14 16z"
          fill="var(--color-login-heart)"
        />
      </g>

      {/* Man (behind, left) */}
      <g>
        <path
          d="M70 210c0-32 22-52 50-52s50 20 50 52z"
          fill="var(--color-login-shirt-a)"
        />
        <path d="M104 160h32v16a16 16 0 0 1-32 0z" fill="var(--color-login-skin)" />
        <ellipse cx="120" cy="132" rx="34" ry="36" fill="var(--color-login-skin)" />
        <path
          d="M86 126c-4-26 12-44 34-44s38 18 34 44c-3-14-10-20-16-20-6 6-30 6-36 0-6 0-13 6-16 20z"
          fill="var(--color-login-hair)"
        />
        {/* Glasses */}
        <g fill="none" stroke="var(--color-login-glasses)" strokeWidth="3">
          <circle cx="108" cy="132" r="12" />
          <circle cx="134" cy="132" r="12" />
          <path d="M120 132h2" />
          <path d="M96 130l-8-2" />
          <path d="M146 130l8-2" />
        </g>
        <circle cx="108" cy="132" r="2.4" fill="var(--color-login-glasses)" />
        <circle cx="134" cy="132" r="2.4" fill="var(--color-login-glasses)" />
        {/* Smile and cheeks */}
        <path
          d="M110 150c4 5 16 5 20 0"
          fill="none"
          stroke="var(--color-login-glasses)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="97" cy="145" r="5" fill="var(--color-login-cheek)" opacity="0.55" />
        <circle cx="145" cy="145" r="5" fill="var(--color-login-cheek)" opacity="0.55" />
      </g>

      {/* Woman (front, right) */}
      <g>
        <path
          d="M152 210c0-33 24-54 54-54s54 21 54 54z"
          fill="var(--color-login-shirt-b)"
        />
        <path d="M190 162h34v16a17 17 0 0 1-34 0z" fill="var(--color-login-skin)" />
        <ellipse cx="207" cy="136" rx="35" ry="37" fill="var(--color-login-skin)" />
        <path
          d="M170 138c-5-30 14-52 37-52s42 22 37 52c-2-10-8-16-14-18-4 8-14 10-23 10s-19-2-23-10c-6 2-12 8-14 18z"
          fill="var(--color-login-hair)"
        />
        <path
          d="M170 138c-3 14-1 26 4 34 4-8 5-18 3-28zM244 138c3 14 1 26-4 34-4-8-5-18-3-28z"
          fill="var(--color-login-hair)"
        />
        {/* Glasses */}
        <g fill="none" stroke="var(--color-login-glasses)" strokeWidth="3">
          <circle cx="195" cy="136" r="12" />
          <circle cx="221" cy="136" r="12" />
          <path d="M207 136h2" />
          <path d="M183 134l-8-2" />
          <path d="M233 134l8-2" />
        </g>
        <circle cx="195" cy="136" r="2.4" fill="var(--color-login-glasses)" />
        <circle cx="221" cy="136" r="2.4" fill="var(--color-login-glasses)" />
        {/* Smile and cheeks */}
        <path
          d="M197 154c4 5 16 5 20 0"
          fill="none"
          stroke="var(--color-login-glasses)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="184" cy="149" r="5" fill="var(--color-login-cheek)" opacity="0.55" />
        <circle cx="232" cy="149" r="5" fill="var(--color-login-cheek)" opacity="0.55" />
      </g>
    </svg>
  );
}
