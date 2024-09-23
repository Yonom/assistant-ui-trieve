import { TRIEVE_API_URL } from "./const";
import { CreateMessageOptions } from "./createMessage";
import { trieveStream } from "./trieveStream";

type RegenerateMessageOptions = Omit<
  CreateMessageOptions,
  "new_message_content"
>;

export const regenerateMessage = async ({
  dataset_id,
  ...options
}: RegenerateMessageOptions) => {
  const res = await fetch(`${TRIEVE_API_URL}/api/message`, {
    method: "PATCH",
    headers: {
      Authorization: `${process.env.NEXT_PUBLIC_TRIEVE_API_KEY}`,
      "TR-Dataset": dataset_id,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  });

  if (!res.ok) throw new Error(res.statusText);

  return res
    .body!.pipeThrough(new TextDecoderStream())
    .pipeThrough(trieveStream());
};
