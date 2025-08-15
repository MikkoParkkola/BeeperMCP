export interface OcrResult {
  text: string;
  lang?: string;
  confidence?: number;
}

export interface OcrProvider {
  ocr: (mediaUrl: string) => Promise<OcrResult | null>;
}

export const ocrProvider: OcrProvider = {
  async ocr() {
    return null;
  },
};
