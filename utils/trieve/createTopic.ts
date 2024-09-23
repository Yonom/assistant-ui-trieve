import { TRIEVE_API_URL } from "./const";

type CreateTopicOptions = {
  owner_id: string;
  dataset_id: string;
  first_user_message: string;
};
type CreateTopicResponse = {
  created_at: string;
  dataset_id: string;
  deleted: boolean;
  id: string;
  name: string;
  owner_id: string;
  updated_at: string;
};

export const createTopic = async ({
  owner_id,
  dataset_id,
  first_user_message,
}: CreateTopicOptions) => {
  const res = await fetch(`${TRIEVE_API_URL}/api/topic`, {
    method: "POST",
    headers: {
      Authorization: `${process.env.NEXT_PUBLIC_TRIEVE_API_KEY}`,
      "TR-Dataset": dataset_id,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      owner_id,
      first_user_message,
    }),
  });

  if (!res.ok) throw new Error(res.statusText);

  const data: CreateTopicResponse = await res.json();
  return data;
};
