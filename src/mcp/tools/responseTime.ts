import { JSONSchema7 } from "json-schema";
import { toolsSchemas } from "../schemas/tools.js";

export const id = "response_time_stats";
export const inputSchema = toolsSchemas.response_time_stats as JSONSchema7;

export async function handler() {
  return { avg: null, median: null, p95: null, histogram: [] };
}
