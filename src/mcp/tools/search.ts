import { searchHybrid } from "../../index/search.js";
import { JSONSchema7 } from "json-schema";
import { toolsSchemas } from "../schemas/tools.js";

export const id = "search_messages";
export const inputSchema = toolsSchemas.search_messages as JSONSchema7;

export async function handler(input: any) {
  const hits = await searchHybrid(input.query, {
    from: input.from ? new Date(input.from) : undefined,
    to: input.to ? new Date(input.to) : undefined,
    rooms: input.rooms,
    participants: input.participants,
    lang: input.lang,
    types: input.types
  }, input.limit ?? 50);
  return { hits };
}
