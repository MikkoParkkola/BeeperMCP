export interface CaptionResult {
  text: string;
  lang?: string;
  confidence?: number;
}

export interface CaptionProvider {
  caption: (mediaUrl: string) => Promise<CaptionResult | null>;
}

export const captionProvider: CaptionProvider = {
  async caption() {
    return null;
  },
};
