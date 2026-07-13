import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useBoardStore } from "../store/useBoardStore";
import { useAuthStore } from "../store/useAuthStore";
import { api } from "../api/client";
import { toast } from "../store/useToast";
import { DEFAULT_FONT } from "../constants/fonts";
import { parseYoutubeId } from "../utils/youtube";
import StreetScene from "../components/street/StreetScene.jsx";
import BoardHeader from "../components/board/BoardHeader.jsx";
import Toolbar from "../components/canvas/Toolbar.jsx";
import Cursors from "../components/canvas/Cursors.jsx";
import VideoOverlay from "../components/canvas/VideoOverlay.jsx";
import EmojiPicker from "../components/canvas/EmojiPicker.jsx";
import TextInputModal from "../components/canvas/TextInputModal.jsx";
import ImageUploader from "../components/canvas/ImageUploader.jsx";
import ChalkCanvas, { STAGE_W, STAGE_H, BOARD_RECT } from "../components/canvas/ChalkCanvas.jsx";
import "../styles/board-detail.css";

export default function BoardDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clientId = useAuthStore((s) => s.clientId);

  const {
    board,
    elements,
    peers,
    myRole,
    myGrade,
    caps,
    loading,
    error,
    load,
    disconnect,
    sendCursor,
    addElementOptimistic,
    updateElementOptimistic,
    deleteElementOptimistic,
    clearPulse,
  } = useBoardStore();

  // 전체지우기 분필 슬슬 애니메이션
  const [wiping, setWiping] = useState(false);
  useEffect(() => {
    if (clearPulse === 0) return;
    setWiping(true);
    const t = setTimeout(() => setWiping(false), 900);
    return () => clearTimeout(t);
  }, [clearPulse]);

  const [joining, setJoining] = useState(false);
  const joinTriedRef = useRef(false);
  const [tool, setTool] = useState("select");
  const [penColor, setPenColor] = useState("#FFFFFF");
  const [penWidth, setPenWidth] = useState(6);
  const [selectedId, setSelectedId] = useState(null);
  const [modal, setModal] = useState(null); // 'emoji' | 'image' | 'video' | 'text'
  const [playing, setPlaying] = useState(null); // 재생 중 video element

  const [scale, setScale] = useState(1);
  const wrapRef = useRef(null);

  // 로드 + 자동 참여
  useEffect(() => {
    if (!id) return;
    joinTriedRef.current = false;
    load(id, clientId);
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 멤버가 아니면 자동 참여 후 재로드
  useEffect(() => {
    if (!board || loading || joining) return;
    if (myRole == null && !joinTriedRef.current) {
      joinTriedRef.current = true;
      setJoining(true);
      api
        .joinBoard(id)
        .then(() => load(id, clientId))
        .catch(() => {})
        .finally(() => setJoining(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, myRole, loading]);

  // 컨테이너에 맞춰 스케일
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const recompute = () => {
      const r = el.getBoundingClientRect();
      const s = Math.min(r.width / STAGE_W, r.height / STAGE_H);
      setScale(s > 0 ? s : 1);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, []);

  const boardCenter = { x: BOARD_RECT.x + BOARD_RECT.w / 2, y: BOARD_RECT.y + BOARD_RECT.h / 2 };

  const addEl = useCallback(
    async (type, data) => {
      const z = elements.length;
      const res = await addElementOptimistic(id, clientId, type, data, z);
      if (res && res.rejected) {
        toast(res.reason || "금지어가 포함되어 등록할 수 없어요.", "error");
      } else if (res && res.pending) {
        toast("검토가 필요한 내용이라 관리자 확인 후 표시돼요.", "warn");
      } else if (res && res.error) {
        toast(res.error, "error");
      }
      return res;
    },
    [elements.length, addElementOptimistic, id, clientId],
  );

  const onDraw = useCallback((type, data) => addEl(type, data), [addEl]);

  const onUpdate = useCallback(
    (eid, patchData) => {
      const el = elements.find((e) => e.id === eid);
      if (!el) return;
      updateElementOptimistic(id, clientId, eid, { data: { ...el.data, ...patchData } });
    },
    [elements, updateElementOptimistic, id, clientId],
  );

  const onDelete = useCallback(
    (eid) => {
      if (selectedId === eid) setSelectedId(null);
      deleteElementOptimistic(id, clientId, eid);
    },
    [deleteElementOptimistic, id, clientId, selectedId],
  );

  // 삭제 권한: 방장이거나 내가 만든 요소
  const canDeleteEl = useCallback(
    (el) => {
      if (!caps && myRole !== "owner") return false;
      if (myRole === "owner") return true;
      return user && el.authorId === user.id;
    },
    [caps, myRole, user],
  );

  const onCursor = useCallback((x, y) => sendCursor(x, y), [sendCursor]);

  // 드래그 중 실시간 위치 스트리밍 — 로컬 상태는 안 건드리고(내 드래그 방해 X) 서버로만 throttle 전송
  const liveMoveTs = useRef({});
  const onLiveMove = useCallback(
    (eid, patchData) => {
      const now = Date.now();
      if (now - (liveMoveTs.current[eid] || 0) < 70) return;
      liveMoveTs.current[eid] = now;
      const el = useBoardStore.getState().elements.find((e) => e.id === eid);
      if (!el) return;
      api.updateElement(id, eid, { data: { ...el.data, ...patchData }, clientId }).catch(() => {});
    },
    [id, clientId],
  );

  // 선택 요소 액션 (z-order / 신고)
  const selectedEl = elements.find((e) => e.id === selectedId);
  const bringFront = () => {
    const maxZ = Math.max(0, ...elements.map((e) => e.zIndex || 0));
    updateElementOptimistic(id, clientId, selectedId, { zIndex: maxZ + 1 });
  };
  const sendBack = () => {
    const minZ = Math.min(0, ...elements.map((e) => e.zIndex || 0));
    updateElementOptimistic(id, clientId, selectedId, { zIndex: minZ - 1 });
  };
  const reportEl = async () => {
    try {
      await api.report(id, selectedId, "부적절한 콘텐츠 신고");
      toast("신고가 접수됐어요. 관리자가 검토합니다.", "success");
      setSelectedId(null);
    } catch (e) {
      toast(e.message || "신고에 실패했어요.", "error");
    }
  };

  // 모달 확정 핸들러
  const handleEmoji = (em) => addEl("emoji", { emoji: em, x: boardCenter.x - 32, y: boardCenter.y - 32, size: 64, rotation: 0 });
  const handleImage = (url) => addEl("image", { url, x: boardCenter.x - 120, y: boardCenter.y - 80, w: 240, h: 160, rotation: 0 });
  const handleText = (text, font) => addEl("text", { text, x: boardCenter.x - 120, y: boardCenter.y - 30, color: penColor, fontSize: 48, rotation: 0, font: font || DEFAULT_FONT });
  const handleVideo = (input) => {
    const yid = parseYoutubeId(input);
    if (!yid) {
      toast("유튜브 주소를 확인해주세요.", "error");
      return;
    }
    addEl("video", { youtubeId: yid, x: boardCenter.x - 160, y: boardCenter.y - 90, w: 320, h: 180, rotation: 0 });
  };

  if (loading) return <div className="st-splash">🖍️ 칠판을 여는 중…</div>;
  if (error) {
    return (
      <div className="st-splash" style={{ flexDirection: "column", gap: 12 }}>
        <div>{error}</div>
        <button className="bd-btn primary" onClick={() => navigate("/boards")}>
          목록으로
        </button>
      </div>
    );
  }
  if (!board) return <div className="st-splash">칠판을 찾을 수 없어요.</div>;

  return (
    <div className="bd-root">
      <BoardHeader
        board={board}
        peers={peers}
        self={{ ...(user || {}), clientId }}
        myRole={myRole}
        myGrade={myGrade}
        boardId={id}
        onLeave={() => navigate("/boards")}
        onDecorate={() => navigate(`/boards/${id}/decorate`)}
      />

      <div className="bd-stagewrap" ref={wrapRef}>
        <div
          className="bd-scaled"
          style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}
        >
          <StreetScene board={board} />

          <div className="bd-stage-holder">
            <ChalkCanvas
              board={board}
              elements={elements}
              tool={tool}
              penColor={penColor}
              penWidth={penWidth}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              onDraw={onDraw}
              onUpdate={onUpdate}
              onLiveMove={onLiveMove}
              onDelete={onDelete}
              onCursor={onCursor}
              onPlayVideo={(el) => setPlaying(el)}
              canDeleteEl={canDeleteEl}
              scale={scale}
            />
          </div>

          <Cursors peers={peers} scale={scale} />

          {wiping && <div className="bd-wipe" />}

          {playing && <VideoOverlay el={playing} onClose={() => setPlaying(null)} />}
        </div>
      </div>

      {/* 선택 요소 액션 바 (z-order · 신고 · 삭제) */}
      {selectedEl && tool === "select" && (
        <div className="bd-actionbar">
          <button onClick={bringFront} title="맨 앞으로">⬆️ 맨 앞</button>
          <button onClick={sendBack} title="맨 뒤로">⬇️ 맨 뒤</button>
          <span className="bd-actionbar-sep" />
          <button onClick={reportEl} title="신고">🚩 신고</button>
          {canDeleteEl(selectedEl) && (
            <button className="bd-actionbar-del" onClick={() => onDelete(selectedEl.id)} title="삭제">🗑️ 삭제</button>
          )}
        </div>
      )}

      <Toolbar
        tool={tool}
        setTool={setTool}
        penColor={penColor}
        setPenColor={setPenColor}
        penWidth={penWidth}
        setPenWidth={setPenWidth}
        caps={caps}
        onOpen={(kind) => setModal(kind)}
      />

      {modal === "emoji" && <EmojiPicker onPick={handleEmoji} onClose={() => setModal(null)} />}
      {modal === "image" && <ImageUploader onSubmit={handleImage} onClose={() => setModal(null)} />}
      {modal === "text" && (
        <TextInputModal
          title="칠판에 글씨 쓰기"
          placeholder="분필로 쓸 내용을 입력하세요"
          submitLabel="붙이기"
          multiline
          fontPicker
          onSubmit={handleText}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "video" && (
        <TextInputModal
          title="유튜브 영상 붙이기"
          placeholder="유튜브 주소 또는 영상 ID"
          submitLabel="붙이기"
          multiline={false}
          onSubmit={handleVideo}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
