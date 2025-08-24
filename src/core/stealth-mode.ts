import fs from 'fs';
import os from 'os';
import path from 'path';
import { DatabaseManager } from '../db/sqlite.js';

export interface StealthAnalysis {
  roomId: string;
  messageCount: number;
  preview: string[]; // last few lines
}

function homeBase(): string {
  return process.env.BEEPERMCP_HOME || path.join(os.homedir(), '.BeeperMCP');
}

function sqlitePath(): string {
  const logDir = process.env.MESSAGE_LOG_DIR || path.join(homeBase(), 'room-logs');
  return path.join(logDir, 'messages.db');
}

export class StealthMode {
  private db?: DatabaseManager;

  private getDb(): DatabaseManager | null {
    try {
      const file = sqlitePath();
      if (!fs.existsSync(file)) return null;
      if (!this.db) this.db = new DatabaseManager(file, { logSecret: process.env.LOG_SECRET });
      return this.db;
    } catch {
      return null;
    }
  }

  // Read-only analysis that never sends read receipts or modifies state
  async analyzeWithoutTrace(roomId: string): Promise<StealthAnalysis> {
    const db = this.getDb();
    if (!db) return { roomId, messageCount: 0, preview: [] };
    const lines = db.history(roomId, { limit: 200 }) || [];
    return {
      roomId,
      messageCount: lines.length,
      preview: lines.slice(-10),
    };
  }

  // No-op placeholder that documents intent of preserving unread status
  async maintainUnreadStatus(_roomId: string): Promise<void> {
    // Intentionally do nothing: we avoid sending Matrix read markers entirely.
    // This method exists to make the policy explicit at call sites.
    return;
  }
}

export default StealthMode;

