import fs from 'fs';
import path from 'path';
import Pino from 'pino';
import { MatrixClient } from 'matrix-js-sdk';

export async function loadOlm(logger: Pino.Logger): Promise<void> {
  try {
    const olmMod = await import('@matrix-org/olm');
    const Olm = (olmMod as any).default || olmMod;
    await Olm.init();
    (globalThis as any).Olm = Olm;
    logger.info('Olm library initialized');
  } catch (e: any) {
    console.error(
      'Error: @matrix-org/olm not installed or failed to init:',
      e.message,
    );
    process.exit(1);
  }
}

export async function loadRustCryptoAdapter(
  logger: Pino.Logger,
): Promise<((client: MatrixClient) => Promise<void>) | null> {
  try {
    const mod = await import('@matrix-org/matrix-sdk-crypto-nodejs');
    logger.debug('rust-crypto adapter loaded');
    return (mod as any).initRustCrypto;
  } catch (err: any) {
    logger.warn('rust-crypto adapter not available', err);
    return null;
  }
}

export async function loadFileCryptoStore(
  cacheDir: string,
  logger: Pino.Logger,
) {
  try {
    const mod = await import(
      'matrix-js-sdk/dist/cjs/crypto/node/crypto-store.js'
    );
    logger.debug('FileCryptoStore loaded');
    const FileCryptoStoreClass = (mod as any).FileCryptoStore;
    return new FileCryptoStoreClass(path.join(cacheDir, 'crypto-store'));
  } catch (err: any) {
    logger.warn('FileCryptoStore unavailable, using in-memory', err);
    return undefined;
  }
}

export async function restoreRoomKeys(
  client: MatrixClient,
  cacheDir: string,
  logger: Pino.Logger,
) {
  const recoveryKey = process.env.KEY_BACKUP_RECOVERY_KEY;
  if (
    typeof (client as any).restoreKeyBackupWithCache === 'function' &&
    typeof (client as any).getKeyBackupVersion === 'function'
  ) {
    try {
      const backupInfo = await (client as any).getKeyBackupVersion();
      logger.info(
        {
          backupVersion: backupInfo?.version,
          backupAlgorithm: backupInfo?.algorithm,
          recoveryKeyType: backupInfo?.recovery_key?.type,
        },
        'Received key backup info from server.',
      );
      if (!backupInfo) {
        logger.info('No key backup configured on server.');
      } else if (recoveryKey) {
        const restored = await (client as any).restoreKeyBackupWithCache(
          undefined,
          recoveryKey,
          backupInfo as any,
        );
        logger.info(`Restored ${restored.length} room keys via secure backup`);
      } else {
        logger.warn(
          'Key backup exists on server, but no KEY_BACKUP_RECOVERY_KEY provided.',
        );
      }
    } catch (e: any) {
      logger.error('Failed to restore from secure backup:', e.message);
    }
  }
  try {
    const keyFile = path.join(cacheDir, 'room-keys.json');
    if (fs.existsSync(keyFile)) {
      const exported = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
      const cryptoApi = client.getCrypto();
      if (cryptoApi) {
        await cryptoApi.importRoomKeys(exported as any, {});
        if (exported && typeof (exported as any).length === 'number') {
          logger.info(
            `Attempted import from room-keys.json: Found ${exported.length} sessions in the file.`,
          );
        } else {
          logger.warn(
            'Attempted import from room-keys.json: File existed but content was not as expected.',
          );
        }
      }
    }
  } catch (e: any) {
    logger.warn('Failed to import room keys:', e.message);
  }
}
