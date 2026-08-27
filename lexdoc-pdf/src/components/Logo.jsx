export default function Logo({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--brand)" />
      <path d="M20 16h16l8 8v24a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2V18a2 2 0 0 1 2-2z" fill="#ffffff" />
      <path d="M36 16v8h8" fill="none" stroke="var(--brand)" strokeWidth="2" />
      <text x="32" y="40" fontFamily="Arial, sans-serif" fontSize="12" fontWeight="700" textAnchor="middle" fill="var(--brand)">
        IA
      </text>
    </svg>
  );
}
