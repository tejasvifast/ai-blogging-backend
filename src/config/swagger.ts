import type { Application, Request, Response, NextFunction } from 'express'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'
import { env } from './env'
import { logger } from './logger'

/**
 * Hand-authored OpenAPI 3 spec. Kept in one place rather than JSDoc-scraped so
 * the contract is reviewable in a single file. Extend as routes are added.
 */
const spec = {
  openapi: '3.0.3',
  info: {
    title: 'AI Blogging Backend API',
    version: '0.1.0',
    description:
      'REST API powering an AI auto-blogging site: content, auth (email + Google OAuth), AI generation, scheduling, and SEO feeds.',
  },
  servers: [{ url: env.API_URL, description: env.NODE_ENV }],
  tags: [
    { name: 'Auth' },
    { name: 'Posts' },
    { name: 'Categories' },
    { name: 'Tags' },
    { name: 'AI' },
    { name: 'Scheduler' },
    { name: 'Newsletter' },
    { name: 'SEO' },
    { name: 'Health' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Success: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {},
          meta: { type: 'object', nullable: true },
        },
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'NOT_FOUND' },
              message: { type: 'string' },
              details: {},
            },
          },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 10 },
          total: { type: 'integer', example: 42 },
          totalPages: { type: 'integer', example: 5 },
        },
      },
      Post: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          slug: { type: 'string' },
          excerpt: { type: 'string', nullable: true },
          content: { type: 'string' },
          coverImage: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'] },
          isFeatured: { type: 'boolean' },
          isAIGenerated: { type: 'boolean' },
          keywords: { type: 'array', items: { type: 'string' } },
          views: { type: 'integer' },
          readingTime: { type: 'integer', nullable: true },
          publishedAt: { type: 'string', format: 'date-time', nullable: true },
          author: { $ref: '#/components/schemas/PublicUser' },
          category: { $ref: '#/components/schemas/Category' },
          tags: { type: 'array', items: { $ref: '#/components/schemas/Tag' } },
        },
      },
      PublicUser: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          avatar: { type: 'string', nullable: true },
          bio: { type: 'string', nullable: true },
        },
      },
      Category: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string', nullable: true },
          icon: { type: 'string', nullable: true },
          color: { type: 'string', nullable: true },
        },
      },
      Tag: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          slug: { type: 'string' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              user: { type: 'object' },
            },
          },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: 'Missing or invalid credentials',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Resource not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      ValidationError: {
        description: 'Request validation failed',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Readiness check (DB + Redis)',
        responses: { 200: { description: 'Healthy' }, 503: { description: 'Degraded' } },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register with email + password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'name'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          422: { $ref: '#/components/responses/ValidationError' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login with email + password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          401: { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/google': {
      post: {
        tags: ['Auth'],
        summary: 'Login/register with a Google ID token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['idToken'],
                properties: { idToken: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/auth/refresh': {
      post: { tags: ['Auth'], summary: 'Rotate refresh token (httpOnly cookie)', responses: { 200: { description: 'OK' } } },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Current user',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/posts': {
      get: {
        tags: ['Posts'],
        summary: 'List published posts',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 50 } },
          { name: 'category', in: 'query', schema: { type: 'string' }, description: 'category slug' },
          { name: 'tag', in: 'query', schema: { type: 'string' }, description: 'tag slug' },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'featured', in: 'query', schema: { type: 'boolean' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['newest', 'oldest', 'popular'] } },
        ],
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Success' },
                    { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Post' } }, meta: { $ref: '#/components/schemas/Pagination' } } },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/posts/{slug}': {
      get: {
        tags: ['Posts'],
        summary: 'Get a published post by slug',
        parameters: [{ name: 'slug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Post' } } } },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/admin/posts': {
      post: {
        tags: ['Posts'],
        summary: 'Create a post',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'content', 'categoryId'],
                properties: {
                  title: { type: 'string' },
                  content: { type: 'string' },
                  categoryId: { type: 'string' },
                  tagIds: { type: 'array', items: { type: 'string' } },
                  status: { type: 'string', enum: ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'] },
                  scheduledFor: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/categories': {
      get: { tags: ['Categories'], summary: 'List categories with published-post counts', responses: { 200: { description: 'OK' } } },
    },
    '/tags': {
      get: { tags: ['Tags'], summary: 'List tags with published-post counts', responses: { 200: { description: 'OK' } } },
    },
    '/admin/ai/generate': {
      post: {
        tags: ['AI'],
        summary: 'Queue an AI article generation job (10/hour)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['topic', 'categoryId'],
                properties: {
                  topic: { type: 'string' },
                  categoryId: { type: 'string' },
                  tagIds: { type: 'array', items: { type: 'string' } },
                  provider: { type: 'string', enum: ['anthropic', 'openai'] },
                  contentModel: { type: 'string' },
                  autoPublish: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: { 202: { description: 'Job queued, returns { jobId }' }, 429: { description: 'Rate limited' } },
      },
    },
    '/admin/ai/jobs/{id}': {
      get: {
        tags: ['AI'],
        summary: 'Poll a generation job',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/admin/scheduler/cron-jobs': {
      get: { tags: ['Scheduler'], summary: 'List cron jobs', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } },
      post: {
        tags: ['Scheduler'],
        summary: 'Create a generation cron job',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'cronExpression', 'config'],
                properties: {
                  name: { type: 'string' },
                  cronExpression: { type: 'string', example: '0 9 * * 1' },
                  enabled: { type: 'boolean' },
                  config: {
                    type: 'object',
                    required: ['categoryId'],
                    properties: {
                      topic: { type: 'string' },
                      topics: { type: 'array', items: { type: 'string' } },
                      categoryId: { type: 'string' },
                      autoPublish: { type: 'boolean' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/newsletter/subscribe': {
      post: {
        tags: ['Newsletter'],
        summary: 'Subscribe (double opt-in)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } },
            },
          },
        },
        responses: { 201: { description: 'Verification email sent' } },
      },
    },
    '/sitemap.xml': { get: { tags: ['SEO'], summary: 'XML sitemap', responses: { 200: { description: 'XML' } } } },
    '/rss.xml': { get: { tags: ['SEO'], summary: 'RSS 2.0 feed', responses: { 200: { description: 'XML' } } } },
  },
} as const

/**
 * Mount Swagger UI at /api/docs and the raw spec at /api/docs.json.
 * Applies a relaxed CSP on the docs route only — Swagger UI needs inline
 * styles/scripts that the global strict CSP would block.
 */
export function setupSwagger(app: Application): void {
  const docsCsp = helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  })

  app.get('/api/docs.json', (_req: Request, res: Response) => {
    res.json(spec)
  })

  app.use(
    '/api/docs',
    (req: Request, res: Response, next: NextFunction) => docsCsp(req, res, next),
    swaggerUi.serve,
    swaggerUi.setup(spec as unknown as swaggerUi.JsonObject, {
      customSiteTitle: 'AI Blogging API Docs',
      swaggerOptions: { persistAuthorization: true },
    }),
  )

  logger.debug('Swagger UI mounted at /api/docs')
}
