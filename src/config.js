export const PORT = Number.parseInt(process.env.PORT || "8787", 10);
export const HOST = process.env.HOST || "0.0.0.0";
export const REFRESH_INTERVAL_MS = Number.parseInt(process.env.REFRESH_INTERVAL_MS || "3600000", 10);
export const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.REQUEST_TIMEOUT_MS || "10000", 10);
export const SOURCE_CONCURRENCY = Number.parseInt(process.env.SOURCE_CONCURRENCY || "6", 10);
export const SOURCE_BODY_LIMIT_BYTES = Number.parseInt(process.env.SOURCE_BODY_LIMIT_BYTES || "524288", 10);
