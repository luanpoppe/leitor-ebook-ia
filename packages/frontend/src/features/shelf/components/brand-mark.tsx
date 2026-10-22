interface BrandMarkProps {
  className?: string;
}

// A marca é a dobra da página: o objeto do produto, não uma inicial em caixa.
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5.5 3.5h9l4.5 4.5v12.5h-13.5z" />
      <path d="M14.5 3.5V8H19" />
      <path d="M8.5 12h7M8.5 15.5h5" />
    </svg>
  );
}
