import { resolver } from "hono-openapi";
import { ErrorResponseSchema } from "./all-responses";
import { CurrentModelResponseSchema } from "./model-responses";

export const getCurrentModelRouteDescription = {
  tags: ["AI Model"],
  summary: "Get current active model configuration",
  description:
    "Returns the configuration of the currently active AI model, excluding sensitive information like API keys and provider URLs",
  responses: {
    200: {
      description: "Current model configuration",
      content: {
        "application/json": {
          schema: resolver(CurrentModelResponseSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};
