import type { Request, Response } from 'express'
import { sendSuccess, sendCreated } from '../../utils/apiResponse'
import * as service from './newsletter.service'

export async function subscribe(req: Request, res: Response): Promise<void> {
  const result = await service.subscribe(req.body.email)
  const message =
    result.status === 'verified'
      ? "You're already subscribed."
      : 'Check your inbox to confirm your subscription.'
  sendCreated(res, { message, status: result.status })
}

export async function verify(req: Request, res: Response): Promise<void> {
  await service.verify(req.query.token as string)
  sendSuccess(res, { message: 'Subscription confirmed. Welcome aboard!' })
}

export async function unsubscribe(req: Request, res: Response): Promise<void> {
  await service.unsubscribe(req.query.token as string)
  sendSuccess(res, { message: "You've been unsubscribed." })
}
