import request from 'supertest'

// ── Mock all infra so createApp() builds without real DB/Redis/queues. The
// endpoints exercised here fail at middleware/validation before touching them.
jest.mock('../../src/config/redis', () => ({
  redis: { on: jest.fn(), ping: jest.fn(), call: jest.fn(), quit: jest.fn() },
  redisOptions: {},
  connectRedis: jest.fn(),
  disconnectRedis: jest.fn(),
}))

jest.mock('../../src/config/database', () => ({
  prisma: {},
  connectDatabase: jest.fn(),
  disconnectDatabase: jest.fn(),
}))

const fakeQueue = {
  add: jest.fn(),
  getJob: jest.fn(),
  getJobSchedulers: jest.fn().mockResolvedValue([]),
  upsertJobScheduler: jest.fn(),
  removeJobScheduler: jest.fn(),
  close: jest.fn(),
}

jest.mock('../../src/queues/postGeneration.queue', () => ({
  POST_GENERATION_QUEUE: 'post-generation',
  postGenerationQueue: fakeQueue,
  enqueuePostGeneration: jest.fn().mockResolvedValue('job-1'),
}))

jest.mock('../../src/queues/scheduler.queue', () => ({
  SCHEDULER_QUEUE: 'scheduler',
  JOB_PUBLISH_SCHEDULED: 'publish-scheduled',
  JOB_CLEANUP_DRAFTS: 'cleanup-drafts',
  schedulerQueue: fakeQueue,
  registerMaintenanceSchedules: jest.fn(),
}))

jest.mock('../../src/queues', () => ({
  POST_GENERATION_QUEUE: 'post-generation',
  SCHEDULER_QUEUE: 'scheduler',
  postGenerationQueue: fakeQueue,
  schedulerQueue: fakeQueue,
  enqueuePostGeneration: jest.fn().mockResolvedValue('job-1'),
  registerMaintenanceSchedules: jest.fn(),
  closeQueues: jest.fn(),
}))

// Import AFTER mocks are registered.
import { createApp } from '../../src/app'

const app = createApp()

describe('app wiring', () => {
  it('GET /health/live → 200', async () => {
    const res = await request(app).get('/health/live')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('GET / → 200 with service info', async () => {
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('ai-blogging-backend')
  })

  it('unknown route → 404 error envelope', async () => {
    const res = await request(app).get('/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})

describe('validation & auth guards', () => {
  it('POST /auth/register with empty body → 422', async () => {
    const res = await request(app).post('/auth/register').send({})
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('POST /auth/login missing password → 422', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'a@b.com' })
    expect(res.status).toBe(422)
  })

  it('GET /auth/me without token → 401', async () => {
    const res = await request(app).get('/auth/me')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('GET /admin/posts without token → 401', async () => {
    const res = await request(app).get('/admin/posts')
    expect(res.status).toBe(401)
  })
})
