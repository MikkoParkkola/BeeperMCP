'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.StealthMode = void 0;
const fs_1 = __importDefault(require('fs'));
const os_1 = __importDefault(require('os'));
const path_1 = __importDefault(require('path'));
const sqlite_js_1 = require('../db/sqlite.js');
function homeBase() {
  return (
    process.env.BEEPERMCP_HOME ||
    path_1.default.join(os_1.default.homedir(), '.BeeperMCP')
  );
}
function sqlitePath() {
  const logDir =
    process.env.MESSAGE_LOG_DIR || path_1.default.join(homeBase(), 'room-logs');
  return path_1.default.join(logDir, 'messages.db');
}
class StealthMode {
  getDb() {
    try {
      const file = sqlitePath();
      if (!fs_1.default.existsSync(file)) return null;
      if (!this.db)
        this.db = new sqlite_js_1.DatabaseManager(file, {
          logSecret: process.env.LOG_SECRET,
        });
      return this.db;
    } catch {
      return null;
    }
  }
  // Read-only analysis that never sends read receipts or modifies state
  async analyzeWithoutTrace(roomId) {
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
  async maintainUnreadStatus(_roomId) {
    // Intentionally do nothing: we avoid sending Matrix read markers entirely.
    // This method exists to make the policy explicit at call sites.
    void _roomId;
    return;
  }
}
exports.StealthMode = StealthMode;
exports.default = StealthMode;
