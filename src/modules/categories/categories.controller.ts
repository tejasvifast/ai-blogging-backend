import type { Request, Response } from 'express'
import { sendSuccess, sendCreated, sendNoContent } from '../../utils/apiResponse'
import * as service from './categories.service'

export async function list(_req: Request, res: Response): Promise<void> {
  const categories = await service.listAll()
  sendSuccess(res, categories)
}

export async function getBySlug(req: Request, res: Response): Promise<void> {
  const category = await service.getBySlug(req.params.slug as string)
  sendSuccess(res, category)
}

export async function create(req: Request, res: Response): Promise<void> {
  const category = await service.create(req.body)
  sendCreated(res, category)
}

export async function update(req: Request, res: Response): Promise<void> {
  const category = await service.update(req.params.id as string, req.body)
  sendSuccess(res, category)
}

export async function remove(req: Request, res: Response): Promise<void> {
  await service.remove(req.params.id as string)
  sendNoContent(res)
}
