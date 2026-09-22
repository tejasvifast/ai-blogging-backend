import type { Request, Response } from 'express'
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/apiResponse'
import { UnauthorizedError } from '../../utils/errors'
import * as postsService from './posts.service'

// ── Public ─────────────────────────────────────────────────────

export async function listPublic(req: Request, res: Response): Promise<void> {
  const { posts, meta } = await postsService.listPublic(req.query as never)
  sendSuccess(res, posts, 200, meta as unknown as Record<string, unknown>)
}

export async function getBySlug(req: Request, res: Response): Promise<void> {
  const post = await postsService.getPublicBySlug(req.params.slug as string)
  sendSuccess(res, post)
}

// ── Admin ──────────────────────────────────────────────────────

export async function listAdmin(req: Request, res: Response): Promise<void> {
  const { posts, meta } = await postsService.listAdmin(req.query as never)
  sendSuccess(res, posts, 200, meta as unknown as Record<string, unknown>)
}

export async function getByIdAdmin(req: Request, res: Response): Promise<void> {
  const post = await postsService.getByIdAdmin(req.params.id as string)
  sendSuccess(res, post)
}

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError('Authentication required')
  const post = await postsService.createPost(req.body, req.user.id)
  sendCreated(res, post)
}

export async function update(req: Request, res: Response): Promise<void> {
  const post = await postsService.updatePost(req.params.id as string, req.body)
  sendSuccess(res, post)
}

export async function remove(req: Request, res: Response): Promise<void> {
  await postsService.deletePost(req.params.id as string)
  sendNoContent(res)
}

export async function publish(req: Request, res: Response): Promise<void> {
  const post = await postsService.publishPost(req.params.id as string)
  sendSuccess(res, post)
}
