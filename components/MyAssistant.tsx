"use client";

import {
  Thread,
  ThreadMessageLike,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import { makeMarkdownText } from "@assistant-ui/react-markdown";

import {
  getHistory,
  createTopic,
  createMessage,
  Chunk,
  TrieveStreamPart,
  editMessage,
  regenerateMessage,
} from "@/utils/trieve";
import { useCallback, useEffect, useRef, useState } from "react";
import { asAsyncIterable } from "@/utils/trieve/asAsyncIterable";

const MarkdownText = makeMarkdownText();

export interface Message {
  sort_order: number;
  role: string;
  content: string;
  citations?: Chunk[];
}

const convertMessage = (message: Message): ThreadMessageLike => {
  return {
    id: message.sort_order.toString(),
    role: message.role === "user" ? "user" : "assistant",
    content: message.content,
  };
};

const DATASET_ID = process.env.NEXT_PUBLIC_TRIEVE_DATASET_ID!;
const OWNER_ID = "abcd";

const fetchMessages = async (topicId: string | undefined) => {
  if (!topicId) return [];
  return getHistory({
    dataset_id: DATASET_ID,
    messages_topic_id: topicId,
  });
};

const sliceMessagesUntil = (messages: Message[], messageId: string | null) => {
  if (messageId == null) return [];

  let messageIdx = messages.findIndex(
    (m) => m.sort_order.toString() === messageId
  );
  if (messageIdx === -1)
    throw new Error(`Message with id ${messageId} not found`);

  return messages.slice(0, messageIdx + 1);
};

export function MyAssistant() {
  const [title, setTitle] = useState("");
  const threadIdRef = useRef<string | undefined>();
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const withRunning = useCallback(async <T,>(promise: Promise<T>) => {
    setIsRunning(true);
    try {
      return await promise;
    } finally {
      setIsRunning(false);
    }
  }, []);

  useEffect(() => {
    fetchMessages(undefined).then((data) => {
      setMessages(data);
    });
  }, []);

  const handleStream = useCallback(
    async (stream: ReadableStream<TrieveStreamPart>) => {
      let assistantMessage = "";
      for await (const chunk of asAsyncIterable(stream)) {
        if (chunk.type === "text-delta") {
          assistantMessage += chunk.textDelta;
          setMessages((prev) => [
            ...prev.slice(0, -1),
            {
              ...prev[prev.length - 1],
              content: assistantMessage,
            },
          ]);
        } else if (chunk.type === "citations") {
          setMessages((prev) => [
            ...prev.slice(0, -1),
            {
              ...prev[prev.length - 1],
              citations: chunk.citations,
            },
          ]);
        }
      }
    },
    []
  );

  const runtime = useExternalStoreRuntime({
    isRunning,
    messages,
    convertMessage,
    onNew: async ({ content }) => {
      const userMessage = content
        .filter((m) => m.type === "text")
        .map((m) => m.text)
        .join("\n\n");

      setMessages((prev) => [
        ...prev,
        {
          sort_order: prev.length + 1,
          role: "user",
          content: userMessage,
        },
        {
          sort_order: prev.length + 2,
          role: "assistant",
          content: "",
        },
      ]);

      if (!threadIdRef.current) {
        const topicResponse = await withRunning(
          createTopic({
            dataset_id: DATASET_ID,
            owner_id: OWNER_ID,
            first_user_message: userMessage,
          })
        );
        threadIdRef.current = topicResponse.id;
        setTitle(topicResponse.name);
      }

      await withRunning(
        createMessage({
          dataset_id: DATASET_ID,
          topic_id: threadIdRef.current,
          new_message_content: userMessage,
        }).then(handleStream)
      );
    },
    onEdit: async ({ content, parentId }) => {
      const userMessage = content
        .filter((m) => m.type === "text")
        .map((m) => m.text)
        .join("\n\n");

      let message_sort_order = 0;
      setMessages((prev) => {
        prev = sliceMessagesUntil(prev, parentId);
        message_sort_order = prev.length + 1;
        return [
          ...prev,
          {
            sort_order: prev.length + 1,
            role: "user",
            content: userMessage,
          },
          {
            sort_order: prev.length + 2,
            role: "assistant",
            content: "",
          },
        ];
      });

      await withRunning(
        editMessage({
          dataset_id: DATASET_ID,
          topic_id: threadIdRef.current!,
          message_sort_order,
          new_message_content: userMessage,
        }).then(handleStream)
      );
    },

    onReload: async () => {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          ...prev[prev.length - 1],
          content: "",
          citations: undefined,
        },
      ]);

      await withRunning(
        regenerateMessage({
          dataset_id: DATASET_ID,
          topic_id: threadIdRef.current!,
        }).then(handleStream)
      );
    },
  });

  return (
    <div className="flex flex-col h-full pt-8">
      <p className="text-center font-bold text-xl">{title}</p>
      <Thread
        runtime={runtime}
        assistantMessage={{ components: { Text: MarkdownText } }}
      />
    </div>
  );
}
