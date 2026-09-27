/** Four-point sparkle used for the Gemini control. */
export function GeminiSparkle({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M12 1.6c.28 3.86 1.7 6.5 4.54 8.4C13.7 12.9 12.28 15.54 12 19.4c-.28-3.86-1.7-6.5-4.54-8.4C10.3 8.1 11.72 5.46 12 1.6Z" />
      <path d="M18.7 3.2c.16 1.7.78 2.86 2.1 3.7-1.32.84-1.94 2-2.1 3.7-.16-1.7-.78-2.86-2.1-3.7 1.32-.84 1.94-2 2.1-3.7Z" />
      <path d="M6.2 14.4c.14 1.46.68 2.44 1.84 3.16-1.16.72-1.7 1.7-1.84 3.16-.14-1.46-.68-2.44-1.84-3.16 1.16-.72 1.7-1.7 1.84-3.16Z" />
    </svg>
  );
}
