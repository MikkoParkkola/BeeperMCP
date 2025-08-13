export interface SttResult {
  text: string;
  lang?: string;
  confidence?: number;
}

export interface SttProvider {
  transcribe: (mediaUrl: string) => Promise<SttResult | null>;
}

export const sttProvider: SttProvider = {
  async transcribe() {
    return null;
  }
};
