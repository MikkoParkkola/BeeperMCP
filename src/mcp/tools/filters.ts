export interface CommonFilterInput {
  from?: string;
  to?: string;
  rooms?: string[];
  participants?: string[]; // aka senders
  lang?: string;
  types?: ("text" | "audio" | "image" | "video")[];
}

export function applyCommonFilters(
  where: string[],
  args: any[],
  startIndex: number,
  input: CommonFilterInput,
): number {
  let i = startIndex;
  if (input.rooms?.length) {
    where.push(`room_id = ANY($${i++})`);
    args.push(input.rooms);
  }
  if (input.participants?.length) {
    where.push(`sender = ANY($${i++})`);
    args.push(input.participants);
  }
  if (input.lang) {
    where.push(`lang = $${i++}`);
    args.push(input.lang);
  }
  if (input.from) {
    where.push(`ts_utc >= $${i++}`);
    args.push(new Date(input.from).toISOString());
  }
  if (input.to) {
    where.push(`ts_utc <= $${i++}`);
    args.push(new Date(input.to).toISOString());
  }
  if (input.types?.length) {
    const nonText = input.types.filter((t) => t !== "text");
    if (nonText.length && input.types.includes("text")) {
      where.push(
        `((media_types && $${i}) OR (media_types IS NULL OR array_length(media_types,1)=0))`,
      );
      args.push(nonText);
      i += 1;
    } else if (nonText.length) {
      where.push(`media_types && $${i++}`);
      args.push(nonText);
    } else {
      where.push(`media_types IS NULL OR array_length(media_types,1)=0`);
    }
  }
  return i;
}

