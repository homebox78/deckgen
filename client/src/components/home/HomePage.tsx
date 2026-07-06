import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { uid } from "../../engine/schema";
import { DEFAULT_THEME_ID, themes } from "../../engine/themes";
import { listDecks } from "../../store/storage";
import { useOutlineStore } from "../../store/outlineStore";

const MIN_SLIDES = 3;
const MAX_SLIDES = 12;

export function HomePage() {
  const navigate = useNavigate();
  const begin = useOutlineStore((s) => s.begin);
  const [prompt, setPrompt] = useState("");
  const [slideCount, setSlideCount] = useState(5);
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);
  const decks = useMemo(() => listDecks(), []);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const create = () => {
    if (!prompt.trim()) return;
    const deckId = uid();
    begin({ deckId, prompt: prompt.trim(), slideCount, themeId });
    navigate(`/deck/${deckId}/outline`);
  };

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col items-center gap-10 overflow-y-auto px-6 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">DeckGen</h1>
        <p className="mt-2 text-app-muted">
          주제만 입력하면 AI가 구조를 설계하고 슬라이드를 만들어 드립니다
        </p>
      </div>

      {/* 프롬프트 입력 */}
      <div className="w-full max-w-2xl rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm">
        <textarea
          ref={promptRef}
          className="h-28 w-full resize-none rounded-lg p-3 text-base focus:outline-none"
          placeholder="예: 소상공인 경영바우처 지원 제안서를 만들어줘"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) create();
          }}
        />
        <div className="mt-2 flex items-center gap-4 border-t border-app-border pt-3">
          {/* 슬라이드 수 스텝퍼 */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-app-muted">슬라이드</span>
            <button
              onClick={() => setSlideCount((n) => Math.max(MIN_SLIDES, n - 1))}
              className="h-7 w-7 rounded-md border border-app-border hover:bg-app-bg"
            >
              −
            </button>
            <span className="w-6 text-center font-medium">{slideCount}</span>
            <button
              onClick={() => setSlideCount((n) => Math.min(MAX_SLIDES, n + 1))}
              className="h-7 w-7 rounded-md border border-app-border hover:bg-app-bg"
            >
              +
            </button>
          </div>
          {/* 테마 선택 */}
          <select
            className="rounded-lg border border-app-border bg-white px-3 py-1.5 text-sm"
            value={themeId}
            onChange={(e) => setThemeId(e.target.value)}
          >
            {Object.values(themes).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            onClick={create}
            disabled={!prompt.trim()}
            className="ml-auto rounded-[10px] bg-app-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            생성하기
          </button>
        </div>
      </div>

      {/* 내 덱 */}
      <div className="w-full max-w-2xl">
        <h2 className="mb-3 text-sm font-semibold text-app-muted">내 덱</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {decks.map((d) => (
            <Link
              key={d.id}
              to={`/deck/${d.id}/edit`}
              className="group overflow-hidden rounded-xl border border-app-border bg-app-surface transition-shadow hover:shadow-md"
            >
              <div className="aspect-video w-full bg-app-canvas">
                {d.thumbnail && (
                  <img src={d.thumbnail} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-medium">{d.title}</p>
                <p className="mt-0.5 text-xs text-app-muted">
                  {d.slideCount}장 · {new Date(d.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
          <button
            onClick={() => promptRef.current?.focus()}
            className="flex aspect-[4/3.4] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-app-border text-app-muted transition-colors hover:border-app-accent hover:text-app-accent"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="text-sm">새 덱</span>
          </button>
        </div>
        {decks.length === 0 && (
          <p className="mt-3 text-center text-sm text-app-muted">
            아직 만든 덱이 없습니다. 위 입력창에 주제를 적고 첫 덱을 만들어보세요.
          </p>
        )}
      </div>
    </div>
  );
}
