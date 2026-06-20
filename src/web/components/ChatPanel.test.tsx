import { describe, it, expect } from "vite-plus/test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiProvider } from "../api/context";
import type { ApiClient, ChatMessage } from "../api/client";
import { createFakeApiClient } from "../api/test-fakes";
import { ChatPanel } from "./ChatPanel";

interface ChatCall {
  id: number;
  messages: ChatMessage[];
}

function fakeApiWithChat(
  calls: ChatCall[],
  chunksByCall: string[][] | ((call: number) => string[]),
  options: { throws?: boolean } = {},
): ApiClient {
  return createFakeApiClient({
    chatWithArticle: async function* (id, messages) {
      const callIdx = calls.length;
      calls.push({ id, messages });
      const chunks =
        typeof chunksByCall === "function"
          ? chunksByCall(callIdx)
          : chunksByCall[callIdx] ?? [];
      for (const c of chunks) {
        yield c;
      }
      if (options.throws) throw new Error("boom");
    },
  });
}

function renderPanel(api: ApiClient, articleId = 1) {
  return render(
    <ApiProvider client={api}>
      <ChatPanel articleId={articleId} />
    </ApiProvider>,
  );
}

describe("ChatPanel", () => {
  it("shows no messages until the user asks a question", () => {
    const api = fakeApiWithChat([], []);
    renderPanel(api);
    expect(screen.queryByTestId(/^chat-message-/)).toBeNull();
  });

  it("posts the user's question and renders streamed assistant chunks together", async () => {
    const calls: ChatCall[] = [];
    const api = fakeApiWithChat(calls, [["こん", "にちは"]]);
    renderPanel(api, 42);

    await userEvent.type(screen.getByLabelText("質問を入力"), "教えて");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));

    await waitFor(() => {
      expect(screen.getByTestId("chat-message-assistant-1")).toHaveTextContent(
        "こんにちは",
      );
    });
    expect(screen.getByTestId("chat-message-user-0")).toHaveTextContent("教えて");
    expect(calls).toEqual([
      { id: 42, messages: [{ role: "user", content: "教えて" }] },
    ]);
  });

  it("sends the prior conversation as history on the second turn", async () => {
    const calls: ChatCall[] = [];
    const api = fakeApiWithChat(calls, [["A1"], ["A2"]]);
    renderPanel(api);

    await userEvent.type(screen.getByLabelText("質問を入力"), "Q1");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));
    await waitFor(() =>
      expect(screen.getByTestId("chat-message-assistant-1")).toHaveTextContent(
        "A1",
      ),
    );

    await userEvent.type(screen.getByLabelText("質問を入力"), "Q2");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));
    await waitFor(() => expect(calls).toHaveLength(2));

    expect(calls[1].messages).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "Q2" },
    ]);
  });

  it("renders an error message when the chat stream fails and keeps the history", async () => {
    const calls: ChatCall[] = [];
    const api = fakeApiWithChat(calls, [[]], { throws: true });
    renderPanel(api);

    await userEvent.type(screen.getByLabelText("質問を入力"), "Q");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));

    await waitFor(() =>
      expect(screen.getByTestId("chat-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("chat-message-user-0")).toHaveTextContent("Q");
  });

  it("ignores submissions that contain only whitespace", async () => {
    const calls: ChatCall[] = [];
    const api = fakeApiWithChat(calls, []);
    renderPanel(api);

    await userEvent.type(screen.getByLabelText("質問を入力"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));

    expect(calls).toHaveLength(0);
  });

  it("aborts the in-flight chat stream when the component unmounts", async () => {
    const signals: AbortSignal[] = [];
    let release: () => void = () => {};
    const api: ApiClient = createFakeApiClient({
      chatWithArticle: async function* (_id, _messages, signal) {
        if (signal) signals.push(signal);
        // 解放されるまでこのジェネレータは中断状態を保つ
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    });
    const { unmount } = renderPanel(api);

    await userEvent.type(screen.getByLabelText("質問を入力"), "Q");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));
    await waitFor(() => expect(signals).toHaveLength(1));
    expect(signals[0].aborted).toBe(false);

    unmount();

    expect(signals[0].aborted).toBe(true);
    release();
  });

  it("does not render the error state when the stream is aborted", async () => {
    const api: ApiClient = createFakeApiClient({
      chatWithArticle: async function* () {
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      },
    });
    renderPanel(api);

    await userEvent.type(screen.getByLabelText("質問を入力"), "Q");
    await userEvent.click(screen.getByRole("button", { name: "送信" }));

    // assistant の placeholder は付くが、abort はエラー扱いしない
    await waitFor(() =>
      expect(screen.getByTestId("chat-message-assistant-1")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("chat-error")).toBeNull();
  });
});
