export interface ApprovalForm {
  room_id: string;
  draft_preview: string;
  persona_id?: string;
  send: boolean;
  auto_send_for_this_recipient?: boolean;
}

export async function requestApproval(
  form: Omit<ApprovalForm, "send"> & { send?: boolean }
): Promise<ApprovalForm> {
  // Stub: always deny
  return { ...form, send: false };
}
