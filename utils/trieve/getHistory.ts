import { TRIEVE_API_URL } from "./const";

type GetHistoryOptions = {
  messages_topic_id: string;
  dataset_id: string;
};
type GetHistoryResponse = {
  completion_tokens: number | null;
  content: string;
  created_at: string;
  dataset_id: string;
  deleted: boolean;
  id: string;
  prompt_tokens: number | null;
  role: string;
  sort_order: number;
  topic_id: string;
  updated_at: string;
}[];

export const getHistory = async ({
  dataset_id,
  messages_topic_id,
}: GetHistoryOptions) => {
  const res = await fetch(
    `${TRIEVE_API_URL}/api/message/${messages_topic_id}`,
    {
      headers: {
        Authorization: `${process.env.NEXT_PUBLIC_TRIEVE_API_KEY}`,
        "TR-Dataset": dataset_id,
      },
    }
  );

  if (!res.ok) throw new Error(res.statusText);

  const data: GetHistoryResponse = await res.json();
  return data;
};
