import type { Response } from "express";

export function initSSE(res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
}

export function sendEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function endSSE(res: Response): void {
  sendEvent(res, "done", {});
  res.end();
}

export function sendSSEError(res: Response, message: string): void {
  sendEvent(res, "error", { message });
  res.end();
}
