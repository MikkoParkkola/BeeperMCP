'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.NormalizedEventSchema = void 0;
const zod_1 = require('zod');
exports.NormalizedEventSchema = zod_1.z.object({
  event_id: zod_1.z.string(),
  room_id: zod_1.z.string(),
  sender: zod_1.z.string(),
  text: zod_1.z.string().nullable().optional(),
  ts_utc: zod_1.z.date(),
  lang: zod_1.z.string().nullable().optional(),
  participants: zod_1.z.array(zod_1.z.string()),
  is_me: zod_1.z.boolean().default(false),
  thread_id: zod_1.z.string().nullable().optional(),
  has_media: zod_1.z.boolean().default(false),
  media_types: zod_1.z.array(zod_1.z.string()).default([]),
  tokens: zod_1.z.number().int().nullable().optional(),
  words: zod_1.z.number().int().nullable().optional(),
  chars: zod_1.z.number().int().nullable().optional(),
  attachments: zod_1.z.number().int().nullable().optional(),
  derived_from: zod_1.z
    .object({
      transcriptOf: zod_1.z.string().optional(),
      ocrOf: zod_1.z.string().optional(),
      captionOf: zod_1.z.string().optional(),
      kind: zod_1.z.enum(['stt', 'ocr', 'caption']).optional(),
    })
    .passthrough()
    .nullable()
    .optional(),
});
