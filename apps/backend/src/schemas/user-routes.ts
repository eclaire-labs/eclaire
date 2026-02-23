import { resolver } from "hono-openapi";
import {
  ErrorResponseSchema,
  UnauthorizedSchema,
} from "./all-responses.js";
import { DeleteAllUserDataSchema, UpdateProfileSchema } from "./user-params.js";
import {
  DeleteAllUserDataResponseSchema,
  ProfileUpdateResponseSchema,
  PublicUserProfileResponseSchema,
  UserNotFoundSchema,
  UserProfileResponseSchema,
  UserProfileValidationErrorSchema,
  UserUpdateFailedSchema,
} from "./user-responses.js";

// GET /api/user - Get authenticated user's profile
export const getUserProfileRouteDescription = {
  tags: ["User"],
  summary: "Get user profile",
  description:
    "Retrieve the complete profile information for the authenticated user",
  responses: {
    200: {
      description: "User profile retrieved successfully",
      content: {
        "application/json": {
          schema: resolver(UserProfileResponseSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "User not found",
      content: {
        "application/json": {
          schema: resolver(UserNotFoundSchema),
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

// PATCH /api/user/profile - Update user profile
export const updateUserProfileRouteDescription = {
  tags: ["User"],
  summary: "Update user profile",
  description:
    "Update the authenticated user's profile information. All fields are optional.",
  requestBody: {
    description: "Profile update data",
    content: {
      "application/json": {
        schema: resolver(UpdateProfileSchema) as any,
      },
    },
    required: true,
  },
  responses: {
    200: {
      description: "Profile updated successfully",
      content: {
        "application/json": {
          schema: resolver(ProfileUpdateResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid profile data",
      content: {
        "application/json": {
          schema: resolver(UserProfileValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "User not found or update failed",
      content: {
        "application/json": {
          schema: resolver(UserUpdateFailedSchema),
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

// POST /api/user/delete-all-data - Delete all user data
export const deleteAllUserDataRouteDescription = {
  tags: ["User"],
  summary: "Delete all user data",
  description:
    "Delete all user data (bookmarks, documents, photos, notes, tasks) while keeping the account intact. Requires password confirmation.",
  requestBody: {
    description: "Password confirmation for data deletion",
    content: {
      "application/json": {
        schema: resolver(DeleteAllUserDataSchema) as any,
      },
    },
    required: true,
  },
  responses: {
    200: {
      description: "All user data deleted successfully",
      content: {
        "application/json": {
          schema: resolver(DeleteAllUserDataResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request or password",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "User not found",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
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

// GET /api/user/api-key - Get user's API key
export const getUserApiKeyRouteDescription = {
  tags: ["User"],
  summary: "Get user API key",
  description: "Retrieve the API key for the authenticated user",
  responses: {
    200: {
      description: "API key retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "object" as const,
            properties: {
              apiKey: {
                type: "string" as const,
                description: "The user's API key",
              },
            },
          },
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
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

// POST /api/user/api-key - Generate new API key
export const postUserApiKeyRouteDescription = {
  tags: ["User"],
  summary: "Generate new API key",
  description:
    "Generate a new API key for the authenticated user. This will invalidate the previous key.",
  responses: {
    200: {
      description: "New API key generated successfully",
      content: {
        "application/json": {
          schema: {
            type: "object" as const,
            properties: {
              apiKey: {
                type: "string" as const,
                description: "The new API key",
              },
            },
          },
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
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

// GET /api/user/dashboard-stats - Get dashboard statistics
export const getUserDashboardStatsRouteDescription = {
  tags: ["User"],
  summary: "Get dashboard statistics",
  description:
    "Retrieve statistics for the user's dashboard including content counts and recent activity",
  responses: {
    200: {
      description: "Dashboard statistics retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "object" as const,
            properties: {
              totalBookmarks: {
                type: "number" as const,
                description: "Total number of bookmarks",
              },
              totalNotes: {
                type: "number" as const,
                description: "Total number of notes",
              },
              totalPhotos: {
                type: "number" as const,
                description: "Total number of photos",
              },
              totalDocuments: {
                type: "number" as const,
                description: "Total number of documents",
              },
              totalTasks: {
                type: "number" as const,
                description: "Total number of tasks",
              },
            },
          },
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
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

// GET /api/user/:userId - Get public user profile
export const getPublicUserProfileRouteDescription = {
  tags: ["User"],
  summary: "Get public user profile",
  description: "Retrieve public profile information for a specific user by ID",
  responses: {
    200: {
      description: "Public user profile retrieved successfully",
      content: {
        "application/json": {
          schema: resolver(PublicUserProfileResponseSchema),
        },
      },
    },
    404: {
      description: "User not found",
      content: {
        "application/json": {
          schema: resolver(UserNotFoundSchema),
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
