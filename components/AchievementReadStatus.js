import LoadingScreen from "./LoadingScreen";

// Flat utility feedback; the existing reward compositions only render known data.
export default function AchievementReadStatus({ state, kind, t }) {
  if (state.loading && !state.data) return <LoadingScreen compact message={t(`${kind}.loading`)} />;
  if (!state.error) return null;
  return <div className="my-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
    <p role="alert" className="text-sm" style={{ color: "var(--bt-danger)" }}>
      {t(`${kind}.${state.data ? "refreshError" : "loadError"}`)}
    </p>
    <button type="button" className="btn-ghost min-h-11 px-4 text-sm" onClick={state.retry} disabled={state.loading}>
      {t("plan.retryLoad")}
    </button>
  </div>;
}
