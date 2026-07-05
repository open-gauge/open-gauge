export function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  return (
    <span className="relative group/tip">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tip:block w-64 bg-gray-900 dark:bg-gray-700 text-white text-[11px] rounded-lg px-3 py-2 z-50 shadow-lg leading-relaxed whitespace-normal text-left">
        {content}
      </span>
    </span>
  );
}
