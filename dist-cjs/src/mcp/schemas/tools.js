'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.toolsSchemas = void 0;
const search = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: { type: 'string' },
    participants: { type: 'array', items: { type: 'string' } },
    rooms: { type: 'array', items: { type: 'string' } },
    from: { type: 'string', format: 'date-time' },
    to: { type: 'string', format: 'date-time' },
    limit: { type: 'integer', minimum: 1, maximum: 200 },
    lang: { type: 'string' },
    types: {
      type: 'array',
      items: { enum: ['text', 'audio', 'image', 'video'] },
    },
  },
  required: ['query'],
};
const who_said = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pattern: { type: 'string' },
    isRegex: { type: 'boolean', default: false },
    rooms: { type: 'array', items: { type: 'string' } },
    participants: { type: 'array', items: { type: 'string' } },
    lang: { type: 'string' },
    from: { type: 'string', format: 'date-time' },
    to: { type: 'string', format: 'date-time' },
  },
  required: ['pattern'],
};
const recap = {
  type: 'object',
  additionalProperties: false,
  properties: {
    room: { type: 'string' },
    startEventId: { type: 'string' },
    kStart: { type: 'integer', default: 5 },
    tokenBudget: { type: 'integer', default: 2048 },
  },
  required: ['room', 'startEventId'],
};
const extract_open_loops = {
  type: 'object',
  additionalProperties: false,
  properties: {
    room: { type: 'string' },
    from: { type: 'string', format: 'date-time' },
    to: { type: 'string', format: 'date-time' },
  },
  required: ['room'],
};
const response_time_stats = {
  type: 'object',
  additionalProperties: false,
  properties: {
    room: { type: 'string' },
    participants: { type: 'array', items: { type: 'string' } },
    from: { type: 'string', format: 'date-time' },
    to: { type: 'string', format: 'date-time' },
  },
  required: ['room'],
};
const stats_activity = {
  type: 'object',
  additionalProperties: false,
  required: ['target'],
  properties: {
    target: {
      oneOf: [
        {
          type: 'object',
          required: ['room'],
          properties: { room: { type: 'string' } },
        },
        {
          type: 'object',
          required: ['participant'],
          properties: { participant: { type: 'string' } },
        },
        {
          type: 'object',
          required: ['all'],
          properties: { all: { const: true } },
        },
      ],
    },
    from: { type: 'string', format: 'date-time' },
    to: { type: 'string', format: 'date-time' },
    bucket: { enum: ['day', 'week', 'month', 'year'], default: 'day' },
    lang: { type: 'string' },
    types: {
      type: 'array',
      items: { enum: ['text', 'audio', 'image', 'video'] },
    },
  },
};
const sentiment_trends = {
  type: 'object',
  additionalProperties: false,
  properties: {
    target: {
      oneOf: [
        {
          type: 'object',
          required: ['room'],
          properties: { room: { type: 'string' } },
        },
        {
          type: 'object',
          required: ['participant'],
          properties: { participant: { type: 'string' } },
        },
        {
          type: 'object',
          required: ['all'],
          properties: { all: { const: true } },
        },
      ],
    },
    from: { type: 'string', format: 'date-time' },
    to: { type: 'string', format: 'date-time' },
    bucket: { enum: ['day', 'week', 'month', 'year'], default: 'day' },
    lang: { type: 'string' },
    types: {
      type: 'array',
      items: { enum: ['text', 'audio', 'image', 'video'] },
    },
    alpha: { type: 'number', minimum: 0, maximum: 1, default: 0.3 },
    sensitivity: { type: 'number', minimum: 0, default: 0.5 },
  },
  required: ['target'],
};
const sentiment_distribution = {
  type: 'object',
  additionalProperties: false,
  properties: {
    target: {
      oneOf: [
        {
          type: 'object',
          required: ['room'],
          properties: { room: { type: 'string' } },
        },
        {
          type: 'object',
          required: ['participant'],
          properties: { participant: { type: 'string' } },
        },
        {
          type: 'object',
          required: ['all'],
          properties: { all: { const: true } },
        },
      ],
    },
    from: { type: 'string', format: 'date-time' },
    to: { type: 'string', format: 'date-time' },
    lang: { type: 'string' },
    types: {
      type: 'array',
      items: { enum: ['text', 'audio', 'image', 'video'] },
    },
    bins: { type: 'integer', minimum: 5, maximum: 200, default: 20 },
  },
  required: ['target'],
};
const draft_reply = {
  type: 'object',
  additionalProperties: false,
  properties: {
    room: { type: 'string' },
    eventId: { type: 'string' },
    personaId: { type: 'string' },
    mirror_language: { type: 'boolean', default: false },
  },
  required: ['room', 'eventId'],
};
const send_message = {
  type: 'object',
  additionalProperties: false,
  properties: {
    room_id: { type: 'string' },
    draft_preview: { type: 'string' },
    persona_id: { type: 'string' },
    send: { type: 'boolean', default: false },
    auto_send_for_this_recipient: { type: 'boolean', default: false },
  },
  required: ['room_id', 'draft_preview'],
};
const fetch = {
  type: 'object',
  additionalProperties: false,
  properties: {
    url: { type: 'string' },
    method: { type: 'string' },
    headers: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    maxBytes: { type: 'integer', minimum: 1 },
  },
  required: ['url'],
};
// New MCP tool schemas (agentic)
const inbox_list = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hours: { type: 'integer', minimum: 1 },
    limit: { type: 'integer', minimum: 1 },
    aliases: { type: 'array', items: { type: 'string' } },
  },
};
const brief_room = {
  type: 'object',
  additionalProperties: false,
  properties: { room_id: { type: 'string' } },
  required: ['room_id'],
};
const draft_replies = {
  type: 'object',
  additionalProperties: false,
  properties: {
    room_id: { type: 'string' },
    source: {
      type: 'object',
      additionalProperties: false,
      properties: { text: { type: 'string' }, event_id: { type: 'string' } },
    },
    intention: { type: 'string' },
    extra_instructions: { type: 'string' },
    tone: { type: 'string' },
    language: { type: 'string' },
    to: {
      type: 'string',
      description: 'optional person/user id to tailor tone',
    },
  },
  required: ['room_id', 'source', 'intention'],
};
const revise_reply = {
  type: 'object',
  additionalProperties: false,
  properties: {
    room_id: { type: 'string' },
    base_draft: { type: 'string' },
    extra_instructions: { type: 'string' },
  },
  required: ['room_id', 'base_draft', 'extra_instructions'],
};
const digest_generate = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rooms: { type: 'array', items: { type: 'string' } },
    hours: { type: 'integer', minimum: 1 },
  },
};
const qa = {
  type: 'object',
  additionalProperties: false,
  properties: {
    question: { type: 'string' },
    rooms: { type: 'array', items: { type: 'string' } },
    limit: { type: 'integer', minimum: 1 },
  },
  required: ['question'],
};
const todo_list = {
  type: 'object',
  additionalProperties: false,
  properties: {
    since_hours: { type: 'integer', minimum: 1 },
  },
};
const nudge_create = {
  type: 'object',
  additionalProperties: false,
  properties: {
    task_id: { type: 'string' },
    room_id: { type: 'string' },
    to: { type: 'string' },
    reason: { type: 'string' },
    extra: { type: 'string' },
  },
};
const persona_set = {
  type: 'object',
  additionalProperties: false,
  properties: {
    room_id: { type: 'string' },
    tone: { type: 'string' },
    language: { type: 'string' },
    audience_notes: { type: 'array', items: { type: 'string' } },
    sensitivities: { type: 'array', items: { type: 'string' } },
  },
  required: ['room_id'],
};
// Tone learning/get tools (agentic)
const tone_learn = {
  type: 'object',
  additionalProperties: false,
  properties: {
    aliases: { type: 'array', items: { type: 'string' } },
    since_days: { type: 'integer', minimum: 1 },
    per_person_max: { type: 'integer', minimum: 50 },
  },
  required: ['aliases'],
};
// Translate text
const translate_text = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: { type: 'string' },
    target_language: {
      type: 'string',
      description: 'Target language code or name (e.g., en, fi)',
    },
  },
  required: ['text'],
};
const tone_get = {
  type: 'object',
  additionalProperties: false,
  properties: {
    person_id: { type: 'string' },
  },
  required: ['person_id'],
};
exports.toolsSchemas = {
  search,
  who_said,
  recap,
  extract_open_loops,
  response_time_stats,
  stats_activity,
  sentiment_trends,
  sentiment_distribution,
  draft_reply,
  send_message,
  fetch,
  inbox_list,
  brief_room,
  draft_replies,
  revise_reply,
  digest_generate,
  qa,
  todo_list,
  nudge_create,
  persona_set,
  tone_learn,
  tone_get,
  translate_text,
};
