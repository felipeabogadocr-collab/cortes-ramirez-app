// Set de iconos de línea (estilo elegante, sin emojis) usados en toda la app.
// Todos heredan el color de texto (currentColor) y aceptan `size`.

function base(children, size, strokeWidth = 1.8) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconLock({ size = 16 }) {
  return base(
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>,
    size
  );
}

export function IconShield({ size = 16 }) {
  return base(
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />,
    size
  );
}

export function IconGlobe({ size = 16 }) {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z" />
    </>,
    size
  );
}

export function IconCheck({ size = 16 }) {
  return base(<path d="M4 12l5 5L20 6" />, size, 2.2);
}

export function IconPaperclip({ size = 26 }) {
  return base(
    <path d="M8 12.5l6.5-6.5a3.5 3.5 0 0 1 5 5L11 19.5a5.5 5.5 0 0 1-8-8L13.5 1" transform="translate(0.5 1)" />,
    size
  );
}

export function IconFolder({ size = 26 }) {
  return base(
    <path d="M3.5 6.5a1 1 0 0 1 1-1H10l2 2.2h7.5a1 1 0 0 1 1 1V17a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V6.5z" />,
    size
  );
}

export function IconScissors({ size = 26 }) {
  return base(
    <>
      <circle cx="6.5" cy="6.5" r="2.3" />
      <circle cx="6.5" cy="17.5" r="2.3" />
      <path d="M8.3 8L19 19M8.3 16L19 5" />
    </>,
    size
  );
}

export function IconPen({ size = 26 }) {
  return base(
    <>
      <path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" />
      <path d="M14 7l3 3" />
    </>,
    size
  );
}

export function IconImage({ size = 26 }) {
  return base(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4.5 17.5l5-5 3.5 3.5 2-2 4.5 4.5" />
    </>,
    size
  );
}

export function IconCompress({ size = 26 }) {
  return base(
    <>
      <path d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M9 20H5a1 1 0 0 1-1-1v-4M15 20h4a1 1 0 0 0 1-1v-4" />
      <path d="M12 8v8" />
    </>,
    size
  );
}

export function IconArrowRight({ size = 13 }) {
  return base(<path d="M4 12h15M13 6l6 6-6 6" />, size, 2.2);
}

export function IconChevronUp({ size = 20 }) {
  return base(<path d="M6 15l6-6 6 6" />, size, 2.2);
}

export function IconSun({ size = 16 }) {
  return base(
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
    </>,
    size
  );
}

export function IconMoon({ size = 16 }) {
  return base(<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" />, size);
}

export function IconUpload({ size = 18 }) {
  return base(
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>,
    size
  );
}

export function IconFile({ size = 18 }) {
  return base(
    <>
      <path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4" />
    </>,
    size
  );
}

export function IconEdit({ size = 16 }) {
  return base(
    <path d="M12 20h9M4 20l.6-3.2L14.5 7l3.2 3.2L8 20H4z" />,
    size
  );
}

export function IconType({ size = 16 }) {
  return base(
    <>
      <path d="M5 6h14M12 6v13" />
      <path d="M8 19h8" />
    </>,
    size
  );
}

export function IconChat({ size = 16 }) {
  return base(
    <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4v-10z" />,
    size
  );
}
