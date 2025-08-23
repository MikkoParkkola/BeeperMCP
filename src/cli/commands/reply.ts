export interface ReplyOpts {
  tone?: 'concise' | 'friendly' | 'formal';
}

export async function draftReplies(
  context: string,
  message: string,
  askLLM: (prompt: string) => Promise<string>,
) {
  const prompt = `Write three short reply drafts to the message below.
Return as:
1) Concise: <one paragraph>
2) Friendly: <one paragraph>
3) Formal: <one paragraph>
Keep each under 80 words. Avoid emojis.
Context:
${context}
Message:
${message}
`;
  const out = await askLLM(prompt);
  return out;
}

