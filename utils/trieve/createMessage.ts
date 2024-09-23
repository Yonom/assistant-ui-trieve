import { TRIEVE_API_URL } from "./const";
import { trieveStream } from "./trieveStream";

type GeoInfo = { lat: number; lon: number };
type FieldCondition = {
  date_range?: {
    gt?: string;
    gte?: string;
    lt?: string;
    lte?: string;
  };
  field: string;
  geo_bounding_box?: {
    bottom_right: GeoInfo;
    top_left: GeoInfo;
  };
  geo_polygon?: {
    exterior: GeoInfo[];
    interior?: GeoInfo[][];
  };
  geo_radius?: {
    center: GeoInfo;
    distance: number;
  };
  match_all?: (string | number)[];
  match_any?: (string | number)[];
  range?: {
    gt?: number;
    gte?: number;
    lt?: number;
    lte?: number;
  };
};
type HasIDCondition = {
  ids?: string[];
  tracking_ids?: string[];
};
type ConditionType = FieldCondition | HasIDCondition;
export type CreateMessageOptions = {
  dataset_id: string;
  concat_user_messages_query?: boolean;
  filters?: {
    jsonb_prefilter?: boolean;
    must?: ConditionType[];
    must_not?: ConditionType[];
    should?: ConditionType[];
  };
  highlight_options?: {
    highlight_delimiters?: string[];
    highlight_max_length?: number;
    highlight_max_num?: number;
    highlight_results?: boolean;
    highlight_strategy?: "exactmatch" | "v1";
    highlight_treshold?: number;
    highlight_window?: number;
  };
  llm_options?: {
    completion_first?: boolean;
    frequency_penalty?: number;
    max_tokens?: number;
    presence_penalty?: number;
    stop_tokens?: string[];
    stream_response?: boolean;
    system_prompt?: string;
    temperature?: number;
  };
  new_message_content: string;
  page_size?: number;
  score_treshold?: number;
  search_query?: string;
  search_type?: "fulltext" | "semantic" | "hybrid" | "bm25";
  topic_id: string;
  user_id?: string;
};

export const createMessage = async ({
  dataset_id,
  ...options
}: CreateMessageOptions) => {
  const res = await fetch(`${TRIEVE_API_URL}/api/message`, {
    method: "POST",
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
