import { z } from 'zod'

export const subscribeSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
})

export const tokenQuerySchema = z.object({
  token: z.string().min(10).max(128),
})

export type SubscribeInput = z.infer<typeof subscribeSchema>
