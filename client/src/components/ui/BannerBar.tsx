// 관리자 공지/배너 (§14) — 사용자 홈·에디터 상단에 활성 배너 표시, 세션 내 닫기 기억
import { useEffect, useState } from "react";
import { apiUrl } from "../../api/base";

interface Banner {
  id: string;
  type: "info" | "warn" | "maint";
  text: string;
}

const STYLE: Record<Banner["type"], { color: string; bg: string; border: string }> = {
  info: { color: "#2563EB", bg: "#EFF4FF", border: "#D8E4FB" },
  warn: { color: "#B45309", bg: "#FEF3E2", border: "#F5DFC0" },
  maint: { color: "#E5484D", bg: "#FFF0F0", border: "#F5C6C8" },
};

export function BannerBar() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("deckgen:banners-dismissed") ?? "[]") as string[];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    void fetch(apiUrl("/api/banners"))
      .then((r) => r.json())
      .then((j: { banners?: Banner[] }) => setBanners(j.banners ?? []))
      .catch(() => {});
  }, []);

  // 활성 배너 중 닫지 않은 첫 번째만 (시안: 최대 1개)
  const banner = banners.find((b) => !dismissed.includes(b.id));
  if (!banner) return null;
  const s = STYLE[banner.type] ?? STYLE.info;

  return (
    <div
      className="flex items-center gap-[9px] border-b px-4 py-2"
      style={{ background: s.bg, borderColor: s.border }}
    >
      <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: s.color }} />
      <span className="text-[12.5px] font-medium" style={{ color: s.color }}>
        {banner.text}
      </span>
      <span className="flex-1" />
      <button
        onClick={() => {
          const next = [...dismissed, banner.id];
          setDismissed(next);
          sessionStorage.setItem("deckgen:banners-dismissed", JSON.stringify(next));
        }}
        className="text-[12px] opacity-60 hover:opacity-100"
        style={{ color: s.color }}
        title="닫기"
      >
        <span className="mi text-[15px]">close</span>
      </button>
    </div>
  );
}
