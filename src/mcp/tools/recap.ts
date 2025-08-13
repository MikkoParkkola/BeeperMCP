import { JSONSchema7 } from "json-schema";
import { toolsSchemas } from "../schemas/tools.js";

export const id = "recap";
export const inputSchema = toolsSchemas.recap as JSONSchema7;

export async function handler(input: any) {
  // Placeholder: return minimal window around startEventId
  return { citations: [input.startEventId], summary: "TODO: recap" };
}
