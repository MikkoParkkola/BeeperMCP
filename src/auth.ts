import Pino from 'pino';

export async function verifyAccessToken(
  hs: string,
  token: string,
  uid: string | undefined,
  logger: Pino.Logger,
): Promise<void> {
  try {
    const res = await fetch(`${hs}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { user_id?: string };
    if (!data.user_id) throw new Error('No user_id in response');
    if (uid && data.user_id !== uid) {
      throw new Error(`Token user_id ${data.user_id} does not match ${uid}`);
    }
    logger.info(`Access token validated for ${data.user_id}`);
  } catch (err: any) {
    logger.error(`Failed to validate access token: ${err.message}`);
    process.exit(1);
  }
}
