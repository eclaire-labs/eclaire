import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { NotFoundError } from "../lib/errors.js";
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
import { principalCaller } from "../lib/services/types.js";
import { withAuth } from "../middleware/with-auth.js";
import {
  CreateSessionSchema,
  ListSessionsSchema,
  SendMessageSchema,
  UpdateSessionSchema,
} from "../schemas/sessions-params.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("sessions");

export const sessionsRoutes = new Hono<{ Variables: RouteVariables }>();

// POST /api/sessions - Create a new session
sessionsRoutes.post(
  "/",
  zValidator("json", CreateSessionSchema),
  withAuth(async (c, userId, principal) => {
    const { title, agentActorId } = c.req.valid("json");

    const session = await createSession(
      userId,
      principalCaller(principal),
      title,
      agentActorId,
    );

    logger.info({ userId, sessionId: session.id }, "Created session");

    return c.json(session, 201);
  }, logger),
);

// GET /api/sessions - List sessions
sessionsRoutes.get(
  "/",
  zValidator("query", ListSessionsSchema),
  withAuth(async (c, userId) => {
    const query = c.req.valid("query");
    const agentActorId = query.agentActorId;
    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const { items, totalCount } = await listSessions(
      userId,
      agentActorId,
      limit,
      offset,
    );

    return c.json({
      items,
      totalCount,
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
      throw new NotFoundError("Session");
    }

    return c.json(session);
  }, logger),
);

// PUT /api/sessions/:id - Update session
sessionsRoutes.put(
  "/:id",
  zValidator("json", UpdateSessionSchema),
  withAuth(async (c, userId, principal) => {
    const sessionId = c.req.param("id");
    const body = c.req.valid("json");

    const updated = await updateSession(
      sessionId,
      userId,
      principalCaller(principal),
      body,
    );

    if (!updated) {
      throw new NotFoundError("Session");
    }

    return c.json(updated);
  }, logger),
);

// DELETE /api/sessions/:id - Delete session
sessionsRoutes.delete(
  "/:id",
  withAuth(async (c, userId, principal) => {
    const sessionId = c.req.param("id");
    const success = await deleteSession(
      sessionId,
      userId,
      principalCaller(principal),
    );

    if (!success) {
      throw new NotFoundError("Session");
    }

    return new Response(null, { status: 204 });
  }, logger),
);

// POST /api/sessions/:id/messages - Send message (streaming SSE)
sessionsRoutes.post(
  "/:id/messages",
  zValidator("json", SendMessageSchema),
  withAuth(async (c, userId, principal) => {
    const sessionId = c.req.param("id");
    const requestId = c.get("requestId");
    const body = c.req.valid("json");

    const stream = await sendMessage({
      sessionId,
      userId,
      prompt: body.prompt,
      context: body.context,
      enableThinking: body.enableThinking,
      requestId,
      caller: principalCaller(principal),
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

    return c.json({ aborted });
  }, logger),
);
