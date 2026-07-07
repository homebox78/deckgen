// 댓글 탭 (Demo Act 6) — 현재 슬라이드 댓글 목록 + 답글/해결/삭제
import { useState } from "react";
import {
  addComment,
  addReply,
  deleteComment,
  toggleResolve,
  useComments,
} from "../../store/commentStore";
import { getGuestName, useCollabStore } from "../../store/collabStore";
import { pushNotif } from "../../store/notifStore";

function rel(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

// @멘션 파싱 — 텍스트에서 후보 이름과 일치하는 @이름 추출
function extractMentions(text: string, names: string[]): string[] {
  return names.filter((n) => new RegExp(`@${n}(\\s|$|[^\\w가-힣])`).test(text + " "));
}

export function CommentsPanel({
  deckId,
  slideId,
  slideIndex,
  readOnly = false,
}: {
  deckId: string;
  slideId: string;
  slideIndex: number;
  readOnly?: boolean;
}) {
  const all = useComments(deckId);
  const comments = all.filter((c) => c.slideId === slideId);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [mentionOpen, setMentionOpen] = useState<"draft" | "reply" | null>(null);
  const me = getGuestName() || "나";
  const collab = useCollabStore();
  // 멘션 후보 = 협업자(나 제외) + 데모 기본 후보
  const candidates = Array.from(
    new Set(
      [...(collab.deckId === deckId ? collab.peers.map((p) => p.name) : []), "우진", "지현", "민수"].filter(
        (n) => n && n !== me,
      ),
    ),
  );

  // 멘션 알림 발송 + 텍스트 감지
  const notifyMentions = (text: string) => {
    const hits = extractMentions(text, candidates);
    hits.forEach(() => {
      pushNotif(deckId, {
        who: me,
        color: "#1A1A1A",
        text: `${me}님이 회원님을 멘션했어요: "${text.slice(0, 40)}"`,
        slideIndex,
      });
    });
    return hits;
  };
  const pickMention = (name: string, which: "draft" | "reply") => {
    if (which === "draft") setDraft((d) => d.replace(/@[^@\s]*$/, `@${name} `));
    else setReplyDraft((d) => d.replace(/@[^@\s]*$/, `@${name} `));
    setMentionOpen(null);
  };
  const mentionMenu = (which: "draft" | "reply") =>
    mentionOpen === which && candidates.length > 0 ? (
      <div className="absolute bottom-full left-0 z-30 mb-1 w-44 overflow-hidden rounded-lg border border-app-border bg-white py-1 shadow-lg">
        {candidates.map((n) => (
          <button
            key={n}
            onMouseDown={(e) => {
              e.preventDefault();
              pickMention(n, which);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] hover:bg-app-bg"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-app-text text-[9px] font-semibold text-white">
              {n.slice(0, 1)}
            </span>
            @{n}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-app-border-soft px-4 py-3">
        <span className="text-[13.5px] font-bold">댓글 — 슬라이드 {slideIndex + 1}</span>
        <span className="text-[11.5px] text-app-faint">
          {comments.filter((c) => !c.resolved).length}개 미해결
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {comments.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-app-faint">
            이 슬라이드에 댓글이 없어요.
            <br />
            아래에 남겨 팀과 리뷰하세요.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {comments.map((c) => (
              <div
                key={c.id}
                className={`rounded-xl border px-3 py-2.5 ${c.resolved ? "border-app-border-soft bg-[#FBFBFA] opacity-70" : "border-app-border bg-white"}`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-app-text text-[9px] font-bold text-white">
                    {c.author[0]}
                  </span>
                  <span className="text-[11.5px] font-semibold">{c.author}</span>
                  <span className="text-[10px] text-app-faint">{rel(c.ts)}</span>
                  {c.resolved && (
                    <span className="rounded bg-app-success-soft px-1.5 py-0.5 text-[9px] font-bold text-app-success">해결</span>
                  )}
                </div>
                <p className="text-[12px] leading-relaxed text-app-muted">{c.text}</p>
                {c.replies.map((r) => (
                  <div key={r.id} className="mt-1.5 ml-2 border-l-2 border-app-border-soft pl-2">
                    <span className="text-[10.5px] font-semibold">{r.author}</span>{" "}
                    <span className="text-[11.5px] text-app-muted">{r.text}</span>
                  </div>
                ))}
                {!readOnly && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <button onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} className="text-[10.5px] font-semibold text-app-muted hover:text-app-accent">답글</button>
                    <button onClick={() => toggleResolve(deckId, c.id)} className="text-[10.5px] font-semibold text-app-success">{c.resolved ? "다시 열기" : "✓ 해결"}</button>
                    <button onClick={() => deleteComment(deckId, c.id)} className="text-[10.5px] font-semibold text-app-danger">삭제</button>
                  </div>
                )}
                {replyTo === c.id && (
                  <div className="relative mt-1.5 flex gap-1.5">
                    {mentionMenu("reply")}
                    <input
                      value={replyDraft}
                      onChange={(e) => {
                        setReplyDraft(e.target.value);
                        setMentionOpen(/@[^@\s]*$/.test(e.target.value) ? "reply" : null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && replyDraft.trim() && !mentionOpen) {
                          notifyMentions(replyDraft.trim());
                          addReply(deckId, c.id, me, replyDraft.trim());
                          setReplyDraft("");
                          setReplyTo(null);
                        }
                      }}
                      placeholder="답글 달기… (@로 멘션)"
                      autoFocus
                      className="min-w-0 flex-1 rounded-md border border-app-border px-2 py-1 text-[11px] focus:border-app-accent focus:outline-none"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="border-t border-app-border-soft p-3">
          <div className="relative flex gap-1.5">
            {mentionMenu("draft")}
            <input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setMentionOpen(/@[^@\s]*$/.test(e.target.value) ? "draft" : null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim() && !mentionOpen) {
                  notifyMentions(draft.trim());
                  addComment(deckId, slideId, me, draft.trim());
                  setDraft("");
                }
              }}
              placeholder="댓글 입력 후 Enter (@로 멘션)"
              className="min-w-0 flex-1 rounded-lg border border-app-border px-3 py-2 text-[12px] focus:border-app-accent focus:outline-none"
            />
            <button
              onClick={() => {
                if (draft.trim()) {
                  notifyMentions(draft.trim());
                  addComment(deckId, slideId, me, draft.trim());
                  setDraft("");
                }
              }}
              className="flex-none rounded-lg bg-app-text px-3 py-2 text-[12px] font-semibold text-white hover:opacity-90"
            >
              등록
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
