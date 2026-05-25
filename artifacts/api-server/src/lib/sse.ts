import { type Response } from "express";

type SSEClient = Response;

const clients = new Set<SSEClient>();

export function addSSEClient(res: SSEClient): void {
  clients.add(res);
  res.on("close", () => {
    clients.delete(res);
  });
}

export function broadcast(event: string, data: unknown): void {
  const payload = `data: ${JSON.stringify({ event, data, timestamp: new Date().toISOString() })}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export function broadcastLog(message: string, level: "info" | "teal" | "error" = "info"): void {
  broadcast("log", { message, level });
}

export function clientCount(): number {
  return clients.size;
}
