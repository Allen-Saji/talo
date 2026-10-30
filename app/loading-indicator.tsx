export default function LoadingIndicator({ label = "Loading your workspace", compact = false }: { label?: string; compact?: boolean }) {
  return <div className={`talo-loader${compact ? " talo-loader-compact" : ""}`} role="status" aria-live="polite">
    <span className="talo-loader-orbit" aria-hidden="true"><span /></span>
    <span className="talo-loader-label">{label}</span>
  </div>;
}
export function ButtonSpinner() { return <span className="button-spinner" aria-hidden="true" />; }
