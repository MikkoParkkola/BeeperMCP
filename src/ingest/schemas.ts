import { z } from 'zod';

export const NormalizedEvent = z.object({
  event_id: z.string(),
  room_id: z.string(),
  sender: z.string(),
  text: z.string().nullable().optional(),
  ts_utc: z.date(),
  lang: z.string().nullable().optional(),
  participants: z.array(z.string()),
  is_me: z.boolean().default(false),
  thread_id: z.string().nullable().optional(),
  has_media: z.boolean().default(false),
  media_types: z.array(z.string()).default([]),
  tokens: z.number().int().nullable().optional(),
  words: z.number().int().nullable().optional(),
  chars: z.number().int().nullable().optional(),
  attachments: z.number().int().nullable().optional(),
  derived_from: z
    .object({
      transcriptOf: z.string().optional(),
      ocrOf: z.string().optional(),
      captionOf: z.string().optional(),
      kind: z.enum(['stt', 'ocr', 'caption']).optional(),
    })
    .passthrough()
    .nullable()
    .optional(),
});

export type NormalizedEventT = z.infer<typeof NormalizedEvent>;
