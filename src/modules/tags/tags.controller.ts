import type { Request, Response } from 'express'
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/apiResponse'
import * as service from './tags.service'

export async function list(_req: Request, res: Response): Promise<void> {
  const tags = await service.listAll()
  sendSuccess(res, tags)
}

export async function getBySlug(req: Request, res: Response): Promise<void> {
  const tag = await service.getBySlug(req.params.slug as string)
  sendSuccess(res, tag)
}

export async function create(req: Request, res: Response): Promise<void> {
  const tag = await service.create(req.body)
  sendCreated(res, tag)
}

export async function update(req: Request, res: Response): Promise<void> {
  const tag = await service.update(req.params.id as string, req.body)
  sendSuccess(res, tag)
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(req.params.id as string)
  sendNoContent(res)
}
