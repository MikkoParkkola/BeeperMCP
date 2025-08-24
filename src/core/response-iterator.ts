import { OpenRouterProvider, type ConversationContext } from '../providers/openrouter.js';

export interface PerfectResponse {
  text: string;
  iterations: number;
}

export class ResponseIterator {
  constructor(private readonly provider: OpenRouterProvider) {}

  async iterateUntilPerfect(
    context: ConversationContext,
    userInstructions: string,
    maxIterations: number = 5,
  ): Promise<PerfectResponse> {
    // Initial generation using provider with explicit instructions
    const first = await this.provider.generateResponse(context, userInstructions);
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

export default ResponseIterator;
