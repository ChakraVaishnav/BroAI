/**
 * Logging utilities with dual console + file output
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const errorLogFile = path.join(__dirname, "../../logs/error.log");
const debugLogFile = path.join(__dirname, "../../logs/debug.log");

/**
 * Log error to both console and error.log file
 */
export function logError(msg) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${msg}`;
  fs.appendFileSync(errorLogFile, logLine + "\n");
  console.error(logLine);
}

/**
 * Dual logger: writes to both console AND debug.log file
 */
export function debugLog(msg) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${msg}`;
  console.log(logLine);
  // Also write to debug file to ensure logs are captured
  try {
    fs.appendFileSync(debugLogFile, logLine + "\n");
  } catch (e) {
    // silently ignore file write errors
  }
}

/**
 * Check if error is a rate limit error
 */
export function isRateLimitError(err) {
  const message = String(err?.message || err || "").toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("rate_limit_exceeded") ||
    message.includes("429")
  );
}
