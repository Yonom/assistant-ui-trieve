"use client";

import {
  getExternalStoreMessage,
  TextContentPartProvider,
  Thread,
  ThreadMessageLike,
  useContentPartText,
  useExternalStoreRuntime,
  useMessage,
} from "@assistant-ui/react";
import { makeMarkdownText } from "@assistant-ui/react-markdown";

import { useCallback, useEffect, useRef, useState } from "react";
import { trieve } from "@/utils/trieve/trieve";
import { toTrieveStream, TrieveStreamPart } from "@/utils/trieve/trieveStream";
import { Chunk } from "@/utils/trieve";
import { Root } from "mdast";
import { visit, SKIP } from "unist-util-visit";
import remarkGfm from "remark-gfm";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

function removeFootnoteDefinitions() {
  return (tree: Root) => {
    visit(tree, "footnoteDefinition", (_, index, parent) => {
      if (parent && index !== undefined) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
    });
  };
}

const Citation = ({
  node,
  ...rest
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  node?: any;
}) => {
  const assistantUiMessage = useMessage();

  const indexString = node.children[0].children[0].value;
  let index;
  try {
    index = parseInt(indexString.replace(/[^0-9]/g, ""), 10);
  } catch (e) {
    return <sup {...rest} />;
  }

  const message = getExternalStoreMessage<Message>(assistantUiMessage.message);
  const citation = message?.citations?.[index];

  if (citation === undefined) return <sup {...rest} />;

  console.log({ citation, link: citation.link });
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <sup {...rest} />
      </HoverCardTrigger>
      <HoverCardContent>
        <h3 className="font-bold">
          <a href={citation.link}>
            {(citation.metadata as any)?.title ??
              (citation.metadata as any)?.parent_title}
          </a>
        </h3>
        <p className="font-sm italic pb-4">
          by {(citation.metadata as any)?.by}
        </p>
        <p>{citation.chunk_html}</p>
      </HoverCardContent>
    </HoverCard>
  );
};

const MarkdownText = makeMarkdownText({
  remarkPlugins: [remarkGfm, removeFootnoteDefinitions],
  components: {
    sup: Citation,
  },
});

function generateDummyCitations(citationCount: number) {
  return Array.from(
    { length: citationCount },
    (_, i) => `\n[^${i}]: dummy`
  ).join("");
}

const MarkdownTextWithFootnotes = () => {
  const message = useMessage();
  const citationCount =
    getExternalStoreMessage<Message>(message.message)?.citations?.length ?? 0;

  const {
    part: { text },
    status,
  } = useContentPartText();
  const appendText = "\n\n" + generateDummyCitations(citationCount);
  return (
    <TextContentPartProvider
      text={text + appendText}
      isRunning={status.type === "running"}
    >
      <MarkdownText />
    </TextContentPartProvider>
  );
};

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

const OWNER_ID = "abcd";

const fetchMessages = async (messagesTopicId: string | undefined) => {
  if (!messagesTopicId) return [];
  return trieve.getAllMessagesForTopic({
    messagesTopicId,
  });
};

const fetchInitialSuggestions = async () => {
  return (await trieve.suggestedQueries({})).queries;
};

const sliceMessagesUntil = (messages: Message[], messageId: string | null) => {
  if (messageId == null) return [];

  const messageIdx = messages.findIndex(
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
  const [suggestions, setSuggestions] = useState<string[]>([]);

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
    fetchInitialSuggestions().then((data) => {
      setSuggestions(data);
    });
  }, []);

  const handleStream = useCallback(
    async (stream: AsyncIterable<TrieveStreamPart>) => {
      let assistantMessage = "";
      for await (const chunk of stream) {
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
          trieve.createTopic({
            owner_id: OWNER_ID,
            first_user_message: userMessage,
          })
        );
        threadIdRef.current = topicResponse.id;
        setTitle(topicResponse.name);
      }

      await withRunning(
        trieve
          .createMessageReader({
            topic_id: threadIdRef.current,
            new_message_content: userMessage,
          })
          .then(toTrieveStream)
          .then(handleStream)
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
        trieve
          .editMessageReader({
            topic_id: threadIdRef.current!,
            message_sort_order,
            new_message_content: userMessage,
          })
          .then(toTrieveStream)
          .then(handleStream)
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
        trieve
          .regenerateMessageReader({
            topic_id: threadIdRef.current!,
          })
          .then(toTrieveStream)
          .then(handleStream)
      );
    },
  });

  return (
    <div className="flex flex-col h-full pt-8">
      <p className="text-center font-bold text-xl">{title}</p>
      <Thread
        runtime={runtime}
        welcome={{
          suggestions: suggestions.slice(0, 3).map((s) => ({
            prompt: s,
          })),
        }}
        assistantMessage={{ components: { Text: MarkdownTextWithFootnotes } }}
      />
    </div>
  );
}
