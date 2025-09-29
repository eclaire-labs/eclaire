/**
 * User model representing a user in the application
 */
export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  avatarColor: string | null;
  bio: string | null;
  timezone: string | null;
  city: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string;

  isVerified: boolean;
}