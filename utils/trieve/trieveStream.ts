import { Chunk } from "./Chunk";

export type TrieveStreamPart =
  | {
      type: "text-delta";
      textDelta: string;
    }
  | {
      type: "citations";
      citations: Chunk[];
    };

export function trieveStream() {
  let citationsJsonText = "";
  let isHandlingCitations = true;

  return new TransformStream<string, TrieveStreamPart>({
    transform(chunk, controller) {
      if (!isHandlingCitations) {
        return controller.enqueue({
          type: "text-delta",
          textDelta: chunk,
        });
      }

      const chunkParts = chunk.split("||");
      while (chunkParts.length > 0) {
        const citationPart = chunkParts.shift();
        citationsJsonText += citationPart;

        if (chunkParts.length > 0) {
          // we got a || marker, try to parse citation
          try {
            const citations = JSON.parse(citationsJsonText);
            isHandlingCitations = false;

            controller.enqueue({
              type: "citations",
              citations: citations,
            });

            controller.enqueue({
              type: "text-delta",
              textDelta: chunkParts.join("||"),
            });

            chunkParts.length = 0;
          } catch (e) {
            // not a valid json
            citationsJsonText += "||";
          }
        }
      }
    },
  });
}
