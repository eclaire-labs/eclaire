import { Hono } from "hono";
import { createChildLogger } from "../lib/logger.js";
import {
  abortExecution,
  createSession,
  deleteSession,
  getSession,
  listSessions,
  sendMessage,
  updateSession,
} from "../lib/services/sessions.js";
import { withAuth } from "../middleware/with-auth.js";
import {
  CreateSessionSchema,
  ListSessionsSchema,
  SendMessageSchema,
  UpdateSessionSchema,
} from "../schemas/session-params.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("sessions");

export const sessionsRoutes = new Hono<{ Variables: RouteVariables }>();

// POST /api/sessions - Create a new session
sessionsRoutes.post(
  "/",
  withAuth(async (c, userId) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = CreateSessionSchema.parse(body);

    const session = await createSession(userId, parsed.title);

    logger.info({ userId, sessionId: session.id }, "Created session");

    return c.json({ status: "OK", session });
  }, logger),
);

// GET /api/sessions - List sessions
sessionsRoutes.get(
  "/",
  withAuth(async (c, userId) => {
    const query = ListSessionsSchema.parse(c.req.query());
    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const sessions = await listSessions(userId, limit, offset);

    return c.json({
      items: sessions,
      totalCount: sessions.length,
      limit,
      offset,
    });
  }, logger),
);

// GET /api/sessions/:id - Get session with messages
sessionsRoutes.get(
  "/:id",
  withAuth(async (c, userId) => {
    const sessionId = c.req.param("id");
    const session = await getSession(sessionId, userId);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json({ status: "OK", session });
  }, logger),
);

// PUT /api/sessions/:id - Update session
sessionsRoutes.put(
  "/:id",
  withAuth(async (c, userId) => {
    const sessionId = c.req.param("id");
    const body = UpdateSessionSchema.parse(await c.req.json());

    const updated = await updateSession(sessionId, userId, body);

    if (!updated) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json({ status: "OK", session: updated });
  }, logger),
);

// DELETE /api/sessions/:id - Delete session
sessionsRoutes.delete(
  "/:id",
  withAuth(async (c, userId) => {
    const sessionId = c.req.param("id");
    const success = await deleteSession(sessionId, userId);

    if (!success) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json({ status: "OK", message: "Session deleted" });
  }, logger),
);

// POST /api/sessions/:id/messages - Send message (streaming SSE)
sessionsRoutes.post(
  "/:id/messages",
  withAuth(async (c, userId) => {
    const sessionId = c.req.param("id");
    const requestId = c.get("requestId");
    const body = SendMessageSchema.parse(await c.req.json());

    const stream = await sendMessage({
      sessionId,
      userId,
      prompt: body.prompt,
      context: body.context,
      enableThinking: body.enableThinking,
      requestId,
    });

    // Convert StreamEvent stream to SSE-formatted bytes
    const encoder = new TextEncoder();
    const sseStream = new ReadableStream({
      async start(controller) {
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const sseData = `data: ${JSON.stringify(value)}\n\n`;
            controller.enqueue(encoder.encode(sseData));
          }
        } catch (error) {
          const errorEvent = JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString(),
          });
          controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }, logger),
);

// POST /api/sessions/:id/abort - Abort running execution
sessionsRoutes.post(
  "/:id/abort",
  withAuth(async (c, _userId) => {
    const sessionId = c.req.param("id");
    const aborted = abortExecution(sessionId);

    return c.json({ status: "OK", aborted });
  }, logger),
);
