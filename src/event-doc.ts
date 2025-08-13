export interface TzKeys {
  day_local: string;
  week_local: string;
  month_local: string;
  year_local: string;
  hour_local: string;
  dow_local: number;
}

export interface Stats {
  tokens?: number;
  words?: number;
  chars?: number;
  attachments?: number;
}

export interface Sentiment {
  score?: number;
  subjectivity?: number;
  emotions?: {
    joy?: number;
    sadness?: number;
    anger?: number;
    fear?: number;
    surprise?: number;
    disgust?: number;
  };
  toxicity?: number;
  politeness?: number;
  model_ver?: string;
  provenance?: 'llm' | 'classifier';
}

export interface DerivedFrom {
  transcriptOf?: string;
  ocrOf?: string;
  captionOf?: string;
  kind?: 'stt' | 'ocr' | 'caption';
}

export interface EventDoc {
  eventId: string;
  roomId: string;
  sender: string;
  text?: string;
  ts_utc: string;
  lang?: string;
  participants: string[];
  is_me: boolean;
  thread_id?: string;
  has_media: boolean;
  media_types: string[];
  tz_keys: TzKeys;
  stats: Stats;
  sentiment: Sentiment;
  derived_from?: DerivedFrom;
}

export function computeBasicStats(text = '', attachments = 0): Stats {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { words, chars: text.length, attachments };
}
