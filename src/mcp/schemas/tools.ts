import { JSONSchema7 } from 'json-schema';

const search: JSONSchema7 = {
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

const who_said: JSONSchema7 = {
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

const recap: JSONSchema7 = {
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

const extract_open_loops: JSONSchema7 = {
  type: 'object',
  additionalProperties: false,
  properties: {
    room: { type: 'string' },
    from: { type: 'string', format: 'date-time' },
    to: { type: 'string', format: 'date-time' },
  },
  required: ['room'],
};

const response_time_stats: JSONSchema7 = {
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

const stats_activity: JSONSchema7 = {
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

const sentiment_trends: JSONSchema7 = {
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

const sentiment_distribution: JSONSchema7 = {
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

const draft_reply: JSONSchema7 = {
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

const send_message: JSONSchema7 = {
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

export const toolsSchemas = {
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
};
