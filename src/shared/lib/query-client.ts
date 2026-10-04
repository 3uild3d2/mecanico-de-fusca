import { QueryClient } from "@tanstack/react-query";

let client: QueryClient | null = null;

export function getQueryClient() {
  if (typeof window === "undefined") return new QueryClient();

  client ??= new QueryClient();
  return client;
}
