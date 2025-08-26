'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.inputSchema = exports.id = void 0;
exports.handler = handler;
const search_js_1 = require('../../index/search.js');
const tools_js_1 = require('../schemas/tools.js');
exports.id = 'search';
exports.inputSchema = tools_js_1.toolsSchemas.search;
async function handler(input, owner = 'local') {
  const hits = await (0, search_js_1.searchHybrid)(
    input.query,
    {
      from: input.from ? new Date(input.from) : undefined,
      to: input.to ? new Date(input.to) : undefined,
      rooms: input.rooms,
      participants: input.participants,
      lang: input.lang,
      types: input.types,
    },
    input.limit ?? 50,
    owner,
  );
  return { hits };
}
