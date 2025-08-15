import { JSONSchema7 } from 'json-schema';
import { toolsSchemas } from '../schemas/tools.js';

export const id = 'extract_open_loops';
export const inputSchema = toolsSchemas.extract_open_loops as JSONSchema7;

export async function handler() {
  return { candidates: [] };
}
