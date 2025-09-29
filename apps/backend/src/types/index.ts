// App-wide type definitions

// User profile type
export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
}

// API response types
export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
  status: number;
}

// Auth credential types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials extends LoginCredentials {
  name: string;
}
