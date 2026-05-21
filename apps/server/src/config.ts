import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1024).max(65535).default(8080),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  STORE_DRIVER: z.enum(['memory', 'mongo']).default('memory'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017'),
  MONGODB_DB: z.string().default('ridesync'),
  SOCKET_ADAPTER: z.enum(['memory', 'redis']).default('memory'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
})

export type AppEnv = z.infer<typeof envSchema>

export function loadEnv(): AppEnv {
  return envSchema.parse({
    PORT: process.env.PORT,
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,
    NODE_ENV: process.env.NODE_ENV,
    STORE_DRIVER: process.env.STORE_DRIVER,
    MONGODB_URI: process.env.MONGODB_URI,
    MONGODB_DB: process.env.MONGODB_DB,
    SOCKET_ADAPTER: process.env.SOCKET_ADAPTER,
    REDIS_URL: process.env.REDIS_URL,
  })
}

export function isOriginAllowed(origin: string | undefined, env: AppEnv): boolean {
  if (!origin) {
    return true
  }

  if (env.NODE_ENV !== 'production') {
    return true
  }

  return origin === env.CLIENT_ORIGIN
}
