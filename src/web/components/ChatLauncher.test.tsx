import { describe, it, expect } from "vite-plus/test";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiProvider } from "../api/context";
import type { ApiClient } from "../api/client";
import { createFakeApiClient } from "../api/test-fakes";
import { ChatLauncher } from "./ChatLauncher";

function apiThatStreams(chunks: string[]): ApiClient {
  return createFakeApiClient({
    chatWithArticle: async function* () {
      for (const c of chunks) yield c;
    },
  });
}

function renderLauncher(api: ApiClient = createFakeApiClient(), articleId = 1) {
  return render(
    <ApiProvider client={api}>
      <ChatLauncher articleId={articleId} />
    </ApiProvider>,
  );
}

describe("ChatLauncher", () => {
  it("shows the FAB and hides the popup before the user opens the chat", () => {
    renderLauncher();
    expect(screen.getByRole("button", { name: "AIに質問" })).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the popup and hides the FAB when the FAB is clicked", async () => {
    renderLauncher();
    await userEvent.click(screen.getByRole("button", { name: "AIに質問" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByLabelText("質問を入力")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AIに質問" })).toBeNull();
  });

  it("closes the popup via the close button and re-shows the FAB", async () => {
    renderLauncher();
    await userEvent.click(screen.getByRole("button", { name: "AIに質問" }));
    await userEvent.click(
      screen.getByRole("button", { name: "チャットを閉じる" }),
    );
    expect(screen.getByRole("button", { name: "AIに質問" })).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the popup when Escape is pressed", async () => {
    renderLauncher();
    await userEvent.click(screen.getByRole("button", { name: "AIに質問" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "AIに質問" })).toBeVisible();
  });

  it("moves the popup when the header is dragged", async () => {
    renderLauncher();
    await userEvent.click(screen.getByRole("button", { name: "AIに質問" }));
    const dialog = screen.getByRole("dialog");
    const header = screen.getByTestId("chat-popup-header");
    const before = {
      top: parseFloat(dialog.style.top),
      left: parseFloat(dialog.style.left),
    };

    fireEvent.pointerDown(header, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 60, clientY: 70 });
    fireEvent.pointerUp(window);

    const after = {
      top: parseFloat(dialog.style.top),
      left: parseFloat(dialog.style.left),
    };
    expect(after.left).toBe(before.left - 40);
    expect(after.top).toBe(before.top - 30);
  });

  it("does not start dragging when the close button is mousedown", async () => {
    renderLauncher();
    await userEvent.click(screen.getByRole("button", { name: "AIに質問" }));
    const dialog = screen.getByRole("dialog");
    const close = screen.getByRole("button", { name: "チャットを閉じる" });
    const before = {
      top: parseFloat(dialog.style.top),
      left: parseFloat(dialog.style.left),
    };

    fireEvent.pointerDown(close, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 200, clientY: 200 });
    fireEvent.pointerUp(window);

    expect(parseFloat(dialog.style.top)).toBe(before.top);
    expect(parseFloat(dialog.style.left)).toBe(before.left);
  });

  it("resizes the popup from the top-left handle, growing width/height while moving the corner", async () => {
    renderLauncher();
    await userEvent.click(screen.getByRole("button", { name: "AIに質問" }));
    const dialog = screen.getByRole("dialog");
    const handle = screen.getByTestId("chat-popup-resize-handle");
    const before = {
      top: parseFloat(dialog.style.top),
      left: parseFloat(dialog.style.left),
      width: parseFloat(dialog.style.width),
      height: parseFloat(dialog.style.height),
    };

    // 左上ハンドルを左に40, 上に30移動する → width +40, height +30, left -40, top -30
    fireEvent.pointerDown(handle, { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(window, { clientX: 460, clientY: 470 });
    fireEvent.pointerUp(window);

    expect(parseFloat(dialog.style.width)).toBe(before.width + 40);
    expect(parseFloat(dialog.style.height)).toBe(before.height + 30);
    expect(parseFloat(dialog.style.left)).toBe(before.left - 40);
    expect(parseFloat(dialog.style.top)).toBe(before.top - 30);
  });

  it("clamps the popup so it never extends past the viewport when dragged", async () => {
    renderLauncher();
    await userEvent.click(screen.getByRole("button", { name: "AIに質問" }));
    const dialog = screen.getByRole("dialog");
    const header = screen.getByTestId("chat-popup-header");
    const width = parseFloat(dialog.style.width);
    const height = parseFloat(dialog.style.height);

    // 大きく左上に動かす → VIEWPORT_MARGIN(16) でクランプされる
    fireEvent.pointerDown(header, { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(window, { clientX: -1000, clientY: -1000 });
    fireEvent.pointerUp(window);
    expect(parseFloat(dialog.style.left)).toBe(16);
    expect(parseFloat(dialog.style.top)).toBe(16);

    // 大きく右下に動かす → viewport.size - elem.size - VIEWPORT_MARGIN でクランプ
    fireEvent.pointerDown(header, { clientX: 16, clientY: 16 });
    fireEvent.pointerMove(window, {
      clientX: window.innerWidth + 1000,
      clientY: window.innerHeight + 1000,
    });
    fireEvent.pointerUp(window);
    expect(parseFloat(dialog.style.left)).toBe(window.innerWidth - width - 16);
    expect(parseFloat(dialog.style.top)).toBe(window.innerHeight - height - 16);
  });

  it("preserves chat history when the popup is closed and reopened", async () => {
    renderLauncher(apiThatStreams(["A1"]));
    await userEvent.click(screen.getByRole("button", { name: "AIに質問" }));
    await userEvent.type(screen.getByLabelText("質問を入力"), "Q1");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));
    await waitFor(() =>
      expect(screen.getByTestId("chat-message-assistant-1")).toHaveTextContent(
        "A1",
      ),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "チャットを閉じる" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "AIに質問" }));

    expect(screen.getByTestId("chat-message-user-0")).toHaveTextContent("Q1");
    expect(screen.getByTestId("chat-message-assistant-1")).toHaveTextContent(
      "A1",
    );
  });
});
