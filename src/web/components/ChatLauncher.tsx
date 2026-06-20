import { useEffect, useState } from "react";
import { ChatPanel } from "./ChatPanel";

interface Pos {
  top: number;
  left: number;
}

interface Size {
  width: number;
  height: number;
}

const DEFAULT_SIZE: Size = { width: 380, height: 520 };
const MIN_WIDTH = 280;
const MIN_HEIGHT = 320;
const VIEWPORT_MARGIN = 16;

function getViewportSize(): Size {
  if (typeof window === "undefined") return { width: 1024, height: 768 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** viewport を超えないクランプ済み初期サイズと右下基準の初期位置を一度に計算する。 */
function initialLayout(): { size: Size; pos: Pos } {
  const vp = getViewportSize();
  const size: Size = {
    width: Math.min(DEFAULT_SIZE.width, vp.width - VIEWPORT_MARGIN * 2),
    height: Math.min(DEFAULT_SIZE.height, vp.height - VIEWPORT_MARGIN * 2),
  };
  return {
    size,
    pos: {
      top: Math.max(VIEWPORT_MARGIN, vp.height - size.height - VIEWPORT_MARGIN),
      left: Math.max(VIEWPORT_MARGIN, vp.width - size.width - VIEWPORT_MARGIN),
    },
  };
}

/**
 * 記事詳細ページに常駐する AI チャットの呼び出し口。
 * - 画面右下に「AIに質問」FAB を固定表示
 * - クリックでフローティングのポップアップを開く（非モーダル）
 * - ポップアップはヘッダーをドラッグで移動、左上ハンドルでリサイズ可
 * - Pointer Events を使うため、マウス・タッチ・ペンに統一対応
 * - 閉じても ChatPanel はマウントされ続けるため、再オープン時に履歴と位置/サイズが復元する
 */
export function ChatLauncher({ articleId }: { articleId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ChatFab onOpen={() => setOpen(true)} hidden={open} />
      <ChatPopup
        articleId={articleId}
        onClose={() => setOpen(false)}
        hidden={!open}
      />
    </>
  );
}

function ChatFab({
  onOpen,
  hidden,
}: {
  onOpen: () => void;
  hidden: boolean;
}) {
  // HTML hidden 属性は a11y ツリーから除外するために必須（screen reader / testing-library）。
  // class 側の `hidden` は実描画時に `flex` クラスに上書きされないために必要。両方とも要る。
  return (
    <button
      type="button"
      onClick={onOpen}
      hidden={hidden}
      aria-label="AIに質問"
      aria-haspopup="dialog"
      className={`fixed bottom-4 right-4 z-40 ${
        hidden ? "hidden" : "flex"
      } items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-surface shadow-lg hover:opacity-90`}
    >
      AIに質問
    </button>
  );
}

interface DragState {
  type: "move" | "resize";
  startX: number;
  startY: number;
  startPos: Pos;
  startSize: Size;
}

function ChatPopup({
  articleId,
  onClose,
  hidden,
}: {
  articleId: number;
  onClose: () => void;
  hidden: boolean;
}) {
  const [layout, setLayout] = useState(initialLayout);
  const { pos, size } = layout;
  const [drag, setDrag] = useState<DragState | null>(null);

  // 非モーダルポップアップでもどこにフォーカスしていても Escape で閉じられるよう、
  // ポップアップが開いている間だけ window に keydown を listen する。
  useEffect(() => {
    if (hidden) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden, onClose]);

  // ドラッグ中のみ window 全体に pointermove/pointerup を聞く（touch/mouse/pen 統合）。
  useEffect(() => {
    if (!drag) return;
    const d = drag;
    function onMove(e: PointerEvent) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const vp = getViewportSize();
      if (d.type === "move") {
        const maxLeft = vp.width - d.startSize.width - VIEWPORT_MARGIN;
        const maxTop = vp.height - d.startSize.height - VIEWPORT_MARGIN;
        setLayout({
          size: d.startSize,
          pos: {
            top: clamp(d.startPos.top + dy, VIEWPORT_MARGIN, maxTop),
            left: clamp(d.startPos.left + dx, VIEWPORT_MARGIN, maxLeft),
          },
        });
        return;
      }
      // 左上ハンドルのリサイズ: 右下角を startPos+startSize で固定したまま、左上を動かす。
      const rightEdge = d.startPos.left + d.startSize.width;
      const bottomEdge = d.startPos.top + d.startSize.height;
      const newLeft = clamp(
        d.startPos.left + dx,
        VIEWPORT_MARGIN,
        rightEdge - MIN_WIDTH,
      );
      const newTop = clamp(
        d.startPos.top + dy,
        VIEWPORT_MARGIN,
        bottomEdge - MIN_HEIGHT,
      );
      setLayout({
        pos: { top: newTop, left: newLeft },
        size: { width: rightEdge - newLeft, height: bottomEdge - newTop },
      });
    }
    function onUp() {
      setDrag(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag]);

  function startDrag(type: DragState["type"], e: React.PointerEvent) {
    setDrag({
      type,
      startX: e.clientX,
      startY: e.clientY,
      startPos: pos,
      startSize: size,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="chat-popup-title"
      hidden={hidden}
      style={{
        top: pos.top,
        left: pos.left,
        width: size.width,
        height: size.height,
      }}
      className={`fixed z-50 ${
        hidden ? "hidden" : "flex"
      } flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-xl`}
    >
      <div
        data-testid="chat-popup-resize-handle"
        onPointerDown={(e) => {
          e.stopPropagation();
          startDrag("resize", e);
        }}
        className="absolute left-0 top-0 z-10 h-8 w-8 cursor-nwse-resize touch-none"
        aria-hidden
      />
      <header
        data-testid="chat-popup-header"
        onPointerDown={(e) => startDrag("move", e)}
        className="flex shrink-0 cursor-move touch-none select-none items-center justify-between border-b border-line px-4 py-2"
      >
        <h2 id="chat-popup-title" className="text-sm font-semibold">
          この記事について質問する
        </h2>
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="チャットを閉じる"
          className="cursor-pointer rounded-md p-1 text-muted hover:bg-accent-soft hover:text-accent"
        >
          ×
        </button>
      </header>
      <ChatPanel articleId={articleId} />
    </div>
  );
}
