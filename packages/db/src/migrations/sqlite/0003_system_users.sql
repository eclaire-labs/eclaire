-- Create AI assistant system user for in-process task execution
-- This user is required for task comments and prompt execution
INSERT OR IGNORE INTO `users` (
    `id`,
    `user_type`,
    `display_name`,
    `email`,
    `email_verified`,
    `created_at`,
    `updated_at`
) VALUES (
    'user-ai-assistant',
    'assistant',
    'AI Assistant',
    'ai-assistant@system.local',
    1,
    cast((unixepoch('subsec') * 1000) as integer),
    cast((unixepoch('subsec') * 1000) as integer)
);
