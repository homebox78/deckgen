import { useToast } from "../../store/useToast";

// 다크 토스트 (칠판 상단 중앙) — 분필 감성
export default function Toaster() {
  const toasts = useToast((s) => s.toasts);
  return (
    <div className="st-toaster">
      {toasts.map((t) => (
        <div key={t.id} className={`st-toast st-toast--${t.kind}`}>
          {t.kind === "error" && "🚫 "}
          {t.kind === "warn" && "⚠️ "}
          {t.kind === "success" && "✅ "}
          {t.message}
        </div>
      ))}
    </div>
  );
}
