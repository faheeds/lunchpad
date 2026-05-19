export function DoneBadge() {
  return (
    <div className="flex justify-center py-2">
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold" style={{ background: "#dcfce7", color: "#166534" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
        Done
      </div>
    </div>
  );
}
