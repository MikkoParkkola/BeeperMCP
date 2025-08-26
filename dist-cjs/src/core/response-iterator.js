'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ResponseIterator = void 0;
class ResponseIterator {
  constructor(provider) {
    this.provider = provider;
  }
  async iterateUntilPerfect(context, userInstructions, maxIterations = 5) {
    // Initial generation using provider with explicit instructions
    const first = await this.provider.generateResponse(
      context,
      userInstructions,
    );
    let prev = (first.text || '').trim();
    let iters = 1;
    while (iters < maxIterations) {
      const feedback = `Increase clarity and adherence to: "${userInstructions}". Remove filler, keep it specific.`;
      const next = await this.provider.iterateResponse(prev, feedback);
      const cur = (next.text || '').trim();
      iters++;
      if (!cur) break;
      const delta = Math.abs(cur.length - prev.length);
      if (delta < Math.max(25, Math.floor(prev.length * 0.05))) {
        prev = cur;
        break;
      }
      prev = cur;
    }
    return { text: prev, iterations: iters };
  }
}
exports.ResponseIterator = ResponseIterator;
exports.default = ResponseIterator;
