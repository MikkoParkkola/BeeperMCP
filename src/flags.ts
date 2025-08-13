import { EventEmitter } from "node:events";
import { config } from "./config.js";

export const flags = {
  crossEncoder: () => config.mcp.featureFlags.crossEncoder,
  llmSentimentRefinement: () => config.mcp.featureFlags.llmSentimentRefinement,
  changePointDetection: () => config.mcp.featureFlags.changePointDetection
};

export const versionEvents = new EventEmitter();

/**
 * Call when embeddings.modelVer changes to trigger re-embed workers.
 */
export function onEmbeddingModelChange(newVer: string) {
  versionEvents.emit("embeddingModelChanged", newVer);
}
