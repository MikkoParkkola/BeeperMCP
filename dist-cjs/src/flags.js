'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.versionEvents = exports.flags = void 0;
exports.onEmbeddingModelChange = onEmbeddingModelChange;
const node_events_1 = require('node:events');
const config_js_1 = require('./config.js');
exports.flags = {
  crossEncoder: () => config_js_1.config.mcp.featureFlags.crossEncoder,
  llmSentimentRefinement: () =>
    config_js_1.config.mcp.featureFlags.llmSentimentRefinement,
  changePointDetection: () =>
    config_js_1.config.mcp.featureFlags.changePointDetection,
};
exports.versionEvents = new node_events_1.EventEmitter();
/**
 * Call when embeddings.modelVer changes to trigger re-embed workers.
 */
function onEmbeddingModelChange(newVer) {
  exports.versionEvents.emit('embeddingModelChanged', newVer);
}
