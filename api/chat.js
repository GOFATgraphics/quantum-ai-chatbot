import { getUserFromAuthHeader, getAdminClient } from './lib/supabaseAdmin.js';
import {
  getGoogleConfig,
  refreshAccessToken,
  searchGmail,
  searchDrive,
  readGoogleDoc,
  searchSheets,
  readSheetRange,
  sendGmail,
  createGmailDraft,
  listCalendarEvents,
} from './lib/google.js';
import {
  getMicrosoftConfig,
  refreshMicrosoftToken,
  searchOutlook,
  searchExcelFiles,
} from './lib/microsoft.js';


/** Simple in-memory rate limit: 30 requests / 5 min per user or IP */
const rateBuckets = new Map();
function checkRateLimit(key) {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const max = 30;
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.start + windowMs - now) / 1000) };
  }
  return { ok: true };
}

function sseWrite(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}
