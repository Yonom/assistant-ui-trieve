import { TrieveSDK } from "trieve-ts-sdk";

export const trieve = new TrieveSDK({
  baseUrl: process.env.NEXT_PUBLIC_TRIEVE_API_URL!,
  apiKey: process.env.NEXT_PUBLIC_TRIEVE_API_KEY!,
  datasetId: process.env.NEXT_PUBLIC_TRIEVE_DATASET_ID!,
});
