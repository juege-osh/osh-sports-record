export function sendJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    ...headers
  });
  res.end(body);
}

export function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

export function notFound(res) {
  sendJson(res, 404, { error: "not_found" });
}

export function methodNotAllowed(res) {
  sendJson(res, 405, { error: "method_not_allowed" });
}
