/**
 * Test environment bootstrap. Runs (via setupFilesAfterEnv) before each test
 * file's modules load, so config/env validation passes without a real .env.
 */
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/testdb'
process.env.REDIS_URL ||= 'redis://localhost:6379'
process.env.JWT_ACCESS_SECRET ||= 'test-access-secret-at-least-32-characters-long'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-at-least-32-characters-long'
process.env.GOOGLE_CLIENT_ID ||= 'test-google-client-id'
process.env.GOOGLE_CLIENT_SECRET ||= 'test-google-client-secret'
process.env.REVALIDATE_SECRET ||= 'test-revalidate-secret-16+'
process.env.FRONTEND_URL ||= 'http://localhost:3000'
process.env.API_URL ||= 'http://localhost:4000'
process.env.ADMIN_EMAILS ||= 'admin@example.com'
