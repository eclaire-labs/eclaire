import { beforeAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  TEST_API_KEY,
} from "../utils/test-helpers.js";
import type { User } from "../utils/types.js";

describe("User API Integration Tests", () => {
  let originalUser: User;
  const authenticatedFetch = createAuthenticatedFetch();

  // Store original user data to restore after tests
  beforeAll(async () => {
    const response = await authenticatedFetch(`${BASE_URL}/user`, {
      method: "GET",
    });
    expect(response.status).toBe(200);
    const { user } = (await response.json()) as {
      user: User;
      availableAssignees: any[];
    };
    originalUser = user;
  });

  it("GET /api/user - should retrieve current user profile", async () => {
    await delay(200);
    const response = await authenticatedFetch(`${BASE_URL}/user`, {
      method: "GET",
    });

    expect(response.status).toBe(200);

    const { user, availableAssignees } = (await response.json()) as {
      user: User;
      availableAssignees: any[];
    };

    expect(user).toBeDefined();
    expect(user.id).toBeTypeOf("string");
    expect(user.email).toBeTypeOf("string");
    expect(user.createdAt).toBeTypeOf("string");
    expect(user.updatedAt).toBeTypeOf("string");

    // Profile fields should exist (can be null)
    expect(user).toHaveProperty("displayName");
    expect(user).toHaveProperty("fullName");
    expect(user).toHaveProperty("bio");
    expect(user).toHaveProperty("avatarUrl");
    expect(user).toHaveProperty("avatarColor");
    expect(user).toHaveProperty("timezone");
    expect(user).toHaveProperty("city");
    expect(user).toHaveProperty("country");

    // Test availableAssignees property
    expect(availableAssignees).toBeDefined();
    expect(Array.isArray(availableAssignees)).toBe(true);
    expect(availableAssignees.length).toBeGreaterThan(0);
    // Current user should be included
    expect(availableAssignees.some((assignee) => assignee.id === user.id)).toBe(
      true,
    );
  });

  it("GET /api/user - should return 401 without authentication", async () => {
    const response = await fetch(`${BASE_URL}/user`, {
      method: "GET",
    });

    expect(response.status).toBe(401);
  });

  it("PATCH /api/user/profile - should update displayName", async () => {
    const updateData = {
      displayName: "Updated Display Name",
    };

    const response = await authenticatedFetch(`${BASE_URL}/user/profile`, {
      method: "PATCH",
      body: JSON.stringify(updateData),
    });

    expect(response.status).toBe(200);

    const updatedUser = (await response.json()) as User;
    expect(updatedUser.displayName).toBe(updateData.displayName);
    expect(new Date(updatedUser.updatedAt).getTime()).toBeGreaterThan(
      new Date(originalUser.updatedAt).getTime(),
    );

    // Verify persistence with GET request
    const getResponse = await authenticatedFetch(`${BASE_URL}/user`, {
      method: "GET",
    });
    expect(getResponse.status).toBe(200);
    const { user: persistedUser } = (await getResponse.json()) as {
      user: User;
      availableAssignees: any[];
    };
    expect(persistedUser.displayName).toBe(updateData.displayName);
  });

  it("PATCH /api/user/profile - should update fullName", async () => {
    const updateData = {
      fullName: "John Doe Smith",
    };

    const response = await authenticatedFetch(`${BASE_URL}/user/profile`, {
      method: "PATCH",
      body: JSON.stringify(updateData),
    });

    expect(response.status).toBe(200);

    const updatedUser = (await response.json()) as User;
    expect(updatedUser.fullName).toBe(updateData.fullName);

    // Verify persistence with GET request
    const getResponse = await authenticatedFetch(`${BASE_URL}/user`, {
      method: "GET",
    });
    expect(getResponse.status).toBe(200);
    const { user: persistedUser } = (await getResponse.json()) as {
      user: User;
      availableAssignees: any[];
    };
    expect(persistedUser.fullName).toBe(updateData.fullName);
  });

  it("PATCH /api/user/profile - should update bio", async () => {
    const updateData = {
      bio: "This is my updated bio. I love coding and testing APIs!",
    };

    const response = await authenticatedFetch(`${BASE_URL}/user/profile`, {
      method: "PATCH",
      body: JSON.stringify(updateData),
    });

    expect(response.status).toBe(200);

    const updatedUser = (await response.json()) as User;
    expect(updatedUser.bio).toBe(updateData.bio);

    // Verify persistence with GET request
    const getResponse = await authenticatedFetch(`${BASE_URL}/user`, {
      method: "GET",
    });
    expect(getResponse.status).toBe(200);
    const { user: persistedUser } = (await getResponse.json()) as {
      user: User;
      availableAssignees: any[];
    };
    expect(persistedUser.bio).toBe(updateData.bio);
  });

  it("PATCH /api/user/profile - should update avatarColor", async () => {
    const updateData = {
      avatarColor: "#FF5733",
    };

    const response = await authenticatedFetch(`${BASE_URL}/user/profile`, {
      method: "PATCH",
      body: JSON.stringify(updateData),
    });

    expect(response.status).toBe(200);

    const updatedUser = (await response.json()) as User;
    expect(updatedUser.avatarColor).toBe(updateData.avatarColor);

    // Verify persistence with GET request
    const getResponse = await authenticatedFetch(`${BASE_URL}/user`, {
      method: "GET",
    });
    expect(getResponse.status).toBe(200);
    const { user: persistedUser } = (await getResponse.json()) as {
      user: User;
      availableAssignees: any[];
    };
    expect(persistedUser.avatarColor).toBe(updateData.avatarColor);
  });

  it("PATCH /api/user/profile - should update timezone", async () => {
    const updateData = {
      timezone: "America/New_York",
    };

    const response = await authenticatedFetch(`${BASE_URL}/user/profile`, {
      method: "PATCH",
      body: JSON.stringify(updateData),
    });

    expect(response.status).toBe(200);

    const updatedUser = (await response.json()) as User;
    expect(updatedUser.timezone).toBe(updateData.timezone);

    // Verify persistence with GET request
    const getResponse = await authenticatedFetch(`${BASE_URL}/user`, {
      method: "GET",
    });
    expect(getResponse.status).toBe(200);
    const { user: persistedUser } = (await getResponse.json()) as {
      user: User;
      availableAssignees: any[];
    };
    expect(persistedUser.timezone).toBe(updateData.timezone);
  });

  it("PATCH /api/user/profile - should update city", async () => {
    const updateData = {
      city: "New York",
    };

    const response = await authenticatedFetch(`${BASE_URL}/user/profile`, {
      method: "PATCH",
      body: JSON.stringify(updateData),
    });

    expect(response.status).toBe(200);

    const updatedUser = (await response.json()) as User;
    expect(updatedUser.city).toBe(updateData.city);

    // Verify persistence with GET request
    const getResponse = await authenticatedFetch(`${BASE_URL}/user`, {
      method: "GET",
    });
    expect(getResponse.status).toBe(200);
    const { user: persistedUser } = (await getResponse.json()) as {
      user: User;
      availableAssignees: any[];
    };
    expect(persistedUser.city).toBe(updateData.city);
  });

  it("PATCH /api/user/profile - should update country", async () => {
    const updateData = {
      country: "United States",
    };

    const response = await authenticatedFetch(`${BASE_URL}/user/profile`, {
      method: "PATCH",
      body: JSON.stringify(updateData),
    });

    expect(response.status).toBe(200);

    const updatedUser = (await response.json()) as User;
    expect(updatedUser.country).toBe(updateData.country);

    // Verify persistence with GET request
    const getResponse = await authenticatedFetch(`${BASE_URL}/user`, {
      method: "GET",
    });
    expect(getResponse.status).toBe(200);
    const { user: persistedUser } = (await getResponse.json()) as {
      user: User;
      availableAssignees: any[];
    };
    expect(persistedUser.country).toBe(updateData.country);
  });

  it("PATCH /api/user/profile - should update multiple fields at once", async () => {
    const updateData = {
      displayName: "Multi Update Test",
      fullName: "Multi Update Full Name",
      bio: "Updated multiple fields in one request",
      timezone: "Europe/London",
      city: "London",
      country: "United Kingdom",
    };

    const response = await authenticatedFetch(`${BASE_URL}/user/profile`, {
      method: "PATCH",
      body: JSON.stringify(updateData),
    });

    expect(response.status).toBe(200);

    const updatedUser = (await response.json()) as User;
    expect(updatedUser.displayName).toBe(updateData.displayName);
    expect(updatedUser.fullName).toBe(updateData.fullName);
    expect(updatedUser.bio).toBe(updateData.bio);
    expect(updatedUser.timezone).toBe(updateData.timezone);
    expect(updatedUser.city).toBe(updateData.city);
    expect(updatedUser.country).toBe(updateData.country);

    // Verify persistence with GET request
    const getResponse = await authenticatedFetch(`${BASE_URL}/user`, {
      method: "GET",
    });
    expect(getResponse.status).toBe(200);
    const { user: persistedUser } = (await getResponse.json()) as {
      user: User;
      availableAssignees: any[];
    };
    expect(persistedUser.displayName).toBe(updateData.displayName);
    expect(persistedUser.fullName).toBe(updateData.fullName);
    expect(persistedUser.bio).toBe(updateData.bio);
    expect(persistedUser.timezone).toBe(updateData.timezone);
    expect(persistedUser.city).toBe(updateData.city);
    expect(persistedUser.country).toBe(updateData.country);
  });

  it("PATCH /api/user/profile - should clear fields with empty strings", async () => {
    const updateData = {
      displayName: "",
      fullName: "",
      bio: "",
      avatarColor: "",
      timezone: "",
      city: "",
      country: "",
    };

    const response = await authenticatedFetch(`${BASE_URL}/user/profile`, {
      method: "PATCH",
      body: JSON.stringify(updateData),
    });

    expect(response.status).toBe(200);

    const updatedUser = (await response.json()) as User;
    expect(updatedUser.displayName).toBe("");
    expect(updatedUser.fullName).toBe("");
    expect(updatedUser.bio).toBe("");
    expect(updatedUser.avatarColor).toBe("");
    expect(updatedUser.timezone).toBe("");
    expect(updatedUser.city).toBe("");
    expect(updatedUser.country).toBe("");

    // Verify persistence with GET request
    const getResponse = await authenticatedFetch(`${BASE_URL}/user`, {
      method: "GET",
    });
    expect(getResponse.status).toBe(200);
    const { user: persistedUser } = (await getResponse.json()) as {
      user: User;
      availableAssignees: any[];
    };

    // These fields should be cleared properly - test will reveal if they're being stored as empty strings
    expect(persistedUser.displayName).toBe("");
    expect(persistedUser.fullName).toBe("");
    expect(persistedUser.bio).toBe("");
    expect(persistedUser.avatarColor).toBe("");
    expect(persistedUser.timezone).toBe("");
    expect(persistedUser.city).toBe("");
    expect(persistedUser.country).toBe("");
  });

  it("PATCH /api/user/profile - should persist changes in subsequent GET requests", async () => {
    const updateData = {
      displayName: "Persistence Test",
      bio: "Testing if changes persist",
    };

    // Update the profile
    const updateResponse = await authenticatedFetch(
      `${BASE_URL}/user/profile`,
      {
        method: "PATCH",
        body: JSON.stringify(updateData),
      },
    );

    expect(updateResponse.status).toBe(200);

    // Fetch the profile again to verify persistence
    const getResponse = await authenticatedFetch(`${BASE_URL}/user`, {
      method: "GET",
    });

    expect(getResponse.status).toBe(200);

    const { user } = (await getResponse.json()) as {
      user: User;
      availableAssignees: any[];
    };
    expect(user.displayName).toBe(updateData.displayName);
    expect(user.bio).toBe(updateData.bio);
  });

  it("PATCH /api/user/profile - should return 401 without authentication", async () => {
    const updateData = {
      displayName: "Unauthorized Test",
    };

    const response = await fetch(`${BASE_URL}/user/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updateData),
    });

    expect(response.status).toBe(401);
  });

  it("PATCH /api/user/profile - should validate displayName minimum length", async () => {
    const updateData = {
      displayName: "a", // Too short (min 2 characters)
    };

    const response = await authenticatedFetch(`${BASE_URL}/user/profile`, {
      method: "PATCH",
      body: JSON.stringify(updateData),
    });

    expect(response.status).toBe(400);

    const errorResponse = (await response.json()) as {
      error: string;
      details?: any;
    };
    expect(errorResponse.error).toBe("Invalid data");
    expect(errorResponse.details).toBeDefined();
  });

  it("PATCH /api/user/profile - should validate displayName maximum length", async () => {
    const updateData = {
      displayName: "a".repeat(51), // Too long (max 50 characters)
    };

    const response = await authenticatedFetch(`${BASE_URL}/user/profile`, {
      method: "PATCH",
      body: JSON.stringify(updateData),
    });

    expect(response.status).toBe(400);

    const errorResponse = (await response.json()) as {
      error: string;
      details?: any;
    };
    expect(errorResponse.error).toBe("Invalid data");
  });

  it("PATCH /api/user/profile - should validate field maximum lengths", async () => {
    const updateData = {
      fullName: "a".repeat(101), // Too long (max 100 characters)
      bio: "a".repeat(501), // Too long (max 500 characters)
      timezone: "a".repeat(51), // Too long (max 50 characters)
      city: "a".repeat(51), // Too long (max 50 characters)
      country: "a".repeat(51), // Too long (max 50 characters)
    };

    const response = await authenticatedFetch(`${BASE_URL}/user/profile`, {
      method: "PATCH",
      body: JSON.stringify(updateData),
    });

    expect(response.status).toBe(400);

    const errorResponse = (await response.json()) as {
      error: string;
      details?: any[];
    };
    expect(errorResponse.error).toBe("Invalid data");
    expect(errorResponse.details).toBeDefined();
    expect(errorResponse.details!.length).toBeGreaterThan(0);
  });

  it("PATCH /api/user/profile - should handle partial updates correctly", async () => {
    // First, set some initial values
    const initialData = {
      displayName: "Initial Name",
      bio: "Initial bio",
      city: "Initial City",
    };

    await authenticatedFetch(`${BASE_URL}/user/profile`, {
      method: "PATCH",
      body: JSON.stringify(initialData),
    });

    // Then, update only one field
    const partialUpdate = {
      displayName: "Only Name Changed",
    };

    const response = await authenticatedFetch(`${BASE_URL}/user/profile`, {
      method: "PATCH",
      body: JSON.stringify(partialUpdate),
    });

    expect(response.status).toBe(200);

    const updatedUser = (await response.json()) as User;
    expect(updatedUser.displayName).toBe(partialUpdate.displayName);
    expect(updatedUser.bio).toBe(initialData.bio); // Should remain unchanged
    expect(updatedUser.city).toBe(initialData.city); // Should remain unchanged
  });
});
