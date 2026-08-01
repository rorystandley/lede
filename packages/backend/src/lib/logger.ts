import pino, { type Logger } from 'pino';
import { getConfig } from '../config.js';

let _logger: Logger | null = null;

export function getLogger(): Logger {
  if (_logger) return _logger;
  const config = getConfig();
  _logger = pino({ level: config.LOG_LEVEL });
  return _logger;
}
