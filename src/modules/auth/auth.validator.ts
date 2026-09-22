import { z } from 'zod'

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters') // bcrypt hard limit
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number')

export const registerSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password,
  name: z.string().min(2, 'Name must be at least 2 characters').max(80).trim(),
})

export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
})

export const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'idToken is required'),
})

/** Refresh token may arrive via cookie or body; body form is validated here. */
export const refreshSchema = z.object({
  refreshToken: z.string().optional(),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>
