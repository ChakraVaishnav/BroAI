import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteChat, createChatDraft, loadChats, loadGoogleConnected, loadSelectedChatId, saveChat, saveGoogleConnected, saveSelectedChatId, updateChatTitleFromMessage } from "../storage/chatStorage";
import { sendChatMessage } from "../utils/api";

const EMPTY_PENDING = null;

function createMessageId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toAssistantMessage(payload) {
  return {
    id: createMessageId("assistant"),
    role: "assistant",
    content: payload?.response || "",
    trace: Array.isArray(payload?.trace) ? payload.trace : [],
    modelLabel: payload?.model?.label || payload?.model?.model || "",
    status: payload?.status || "ok",
    createdAt: new Date().toISOString(),
  };
}

function toUserMessage(content) {
  return {
    id: createMessageId("user"),
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useBroAI() {
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(EMPTY_PENDING);
  const abortRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const [loadedChats, savedChatId, savedGoogleState] = await Promise.all([
        loadChats(),
        loadSelectedChatId(),
        loadGoogleConnected(),
      ]);

      if (!mounted) {
        return;
      }

      setChats(loadedChats);
      setSelectedChatId(savedChatId && loadedChats.some((chat) => chat.id === savedChatId) ? savedChatId : loadedChats[0]?.id || null);
      setGoogleConnected(Boolean(savedGoogleState));
      setIsReady(true);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    saveSelectedChatId(selectedChatId);
  }, [selectedChatId]);

  const currentChat = useMemo(() => chats.find((chat) => chat.id === selectedChatId) || null, [chats, selectedChatId]);

  const persistChat = useCallback(async (nextChat) => {
    const saved = await saveChat(nextChat);
    setChats((existing) => {
      const others = existing.filter((chat) => chat.id !== saved.id);
      return [saved, ...others].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    });
    return saved;
  }, []);

  const createNewChat = useCallback(async () => {
    const draft = createChatDraft();
    const saved = await persistChat(draft);
    setSelectedChatId(saved.id);
    setPendingMessage(EMPTY_PENDING);
    return saved.id;
  }, [persistChat]);

  const selectChat = useCallback((chatId) => {
    setSelectedChatId(chatId);
    setPendingMessage(EMPTY_PENDING);
  }, []);

  const removeChat = useCallback(async (chatId) => {
    await deleteChat(chatId);
    setChats((existing) => existing.filter((chat) => chat.id !== chatId));
    setSelectedChatId((current) => {
      if (current === chatId) {
        const remaining = chats.filter((chat) => chat.id !== chatId);
        return remaining[0]?.id || null;
      }
      return current;
    });
  }, [chats]);

  const stopSending = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = null;
    setIsSending(false);
    setPendingMessage(EMPTY_PENDING);
  }, []);

  const toggleGoogleConnection = useCallback(async () => {
    const next = !googleConnected;
    setGoogleConnected(next);
    await saveGoogleConnected(next);
  }, [googleConnected]);

  const sendMessage = useCallback(async (rawText) => {
    const text = String(rawText || "").trim();
    if (!text || isSending) {
      return;
    }

    let activeChat = currentChat;
    if (!activeChat) {
      const draft = createChatDraft();
      activeChat = await persistChat(draft);
      setSelectedChatId(activeChat.id);
    }

    const userMessage = toUserMessage(rawText);
    const nextMessages = [...(activeChat.messages || []), userMessage];
    let nextChat = {
      ...activeChat,
      title: activeChat.messages?.length ? activeChat.title : updateChatTitleFromMessage(activeChat, rawText).title,
      messages: nextMessages,
      updatedAt: new Date().toISOString(),
    };

    nextChat = await persistChat(nextChat);
    setSelectedChatId(nextChat.id);
    setIsSending(true);

    const controller = new AbortController();
    abortRef.current = controller;
    setPendingMessage({
      id: createMessageId("pending"),
      phase: "loading",
      traceShown: [],
      modelLabel: "",
      content: "",
      status: "pending",
    });

    try {
      const payload = await sendChatMessage(rawText, controller.signal);
      if (controller.signal.aborted) {
        return;
      }

      const trace = Array.isArray(payload?.trace) ? payload.trace : [];
      const responseText = payload?.response || "";
      const modelLabel = payload?.model?.label || payload?.model?.model || "";
      const status = payload?.status || "ok";

      if (trace.length) {
        setPendingMessage((current) => ({
          ...(current || {}),
          phase: "trace",
          traceShown: [],
          modelLabel,
          content: "",
          status,
        }));

        for (let index = 0; index < trace.length; index += 1) {
          if (controller.signal.aborted) {
            return;
          }

          // Stagger the trace so the user sees the assistant "thinking".
          // eslint-disable-next-line no-await-in-loop
          await sleep(index === 0 ? 220 : 260);
          setPendingMessage((current) => {
            if (!current || current.phase === "final") {
              return current;
            }

            return {
              ...current,
              traceShown: [...(current.traceShown || []), trace[index]],
              modelLabel,
              status,
            };
          });
        }
      }

      if (controller.signal.aborted) {
        return;
      }

      setPendingMessage((current) => ({
        ...(current || {}),
        phase: "final",
        content: responseText,
        traceShown: [],
        modelLabel,
        status,
      }));

      await sleep(260);

      if (controller.signal.aborted) {
        return;
      }

      const assistantMessage = toAssistantMessage(payload);
      const savedChat = await persistChat({
        ...nextChat,
        messages: [...nextChat.messages, assistantMessage],
        updatedAt: assistantMessage.createdAt,
      });

      setChats((existing) => {
        const others = existing.filter((chat) => chat.id !== savedChat.id);
        return [savedChat, ...others].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      });
      setPendingMessage(EMPTY_PENDING);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      const failurePayload = {
        response: error?.payload?.response || error?.message || "Something went wrong.",
        trace: Array.isArray(error?.payload?.trace) ? error.payload.trace : ["request failed"],
        model: error?.payload?.model || null,
        status: "failed",
      };

      setPendingMessage({
        id: createMessageId("pending"),
        phase: "final",
        traceShown: [],
        modelLabel: failurePayload?.model?.label || failurePayload?.model?.model || "",
        content: failurePayload.response,
        status: "failed",
      });

      await sleep(200);

      const assistantMessage = toAssistantMessage(failurePayload);
      const savedChat = await persistChat({
        ...nextChat,
        messages: [...nextChat.messages, assistantMessage],
        updatedAt: assistantMessage.createdAt,
      });

      setChats((existing) => {
        const others = existing.filter((chat) => chat.id !== savedChat.id);
        return [savedChat, ...others].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      });
      setPendingMessage(EMPTY_PENDING);
    } finally {
      abortRef.current = null;
      setIsSending(false);
    }
  }, [currentChat, isSending, persistChat]);

  const visibleMessages = useMemo(() => {
    if (!currentChat) {
      return pendingMessage ? [pendingMessage] : [];
    }

    return pendingMessage ? [...currentChat.messages, pendingMessage] : currentChat.messages;
  }, [currentChat, pendingMessage]);

  const currentTitle = currentChat?.title || "BRO AI";

  return {
    chats,
    currentChat,
    currentTitle,
    googleConnected,
    isReady,
    isSending,
    visibleMessages,
    selectChat,
    createNewChat,
    removeChat,
    sendMessage,
    stopSending,
    toggleGoogleConnection,
  };
}
