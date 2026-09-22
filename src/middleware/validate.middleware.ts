import type { RequestHandler } from 'express'
import { ZodError, type AnyZodObject, type ZodTypeAny } from 'zod'
import { ValidationError } from '../utils/errors'

/**
 * Validate `req.body`, `req.query`, and/or `req.params` against Zod schemas.
 * On success the parsed (and coerced) values are written back onto the request
 * so downstream handlers get typed, sanitized data.
 *
 *   router.post('/', validate({ body: createPostSchema }), handler)
 */
interface ValidationSchemas {
  body?: AnyZodObject | ZodTypeAny
  query?: AnyZodObject | ZodTypeAny
  params?: AnyZodObject | ZodTypeAny
}

export const validate =
  (schemas: ValidationSchemas): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body)
      if (schemas.params) req.params = schemas.params.parse(req.params)
      if (schemas.query) {
        // req.query is a read-only getter in Express 5-ish setups; assign
        // defensively so coerced values survive.
        const parsed = schemas.query.parse(req.query)
        Object.assign(req.query, parsed)
      }
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        next(new ValidationError('Request validation failed', err.flatten()))
      } else {
        next(err)
      }
    }
  }
