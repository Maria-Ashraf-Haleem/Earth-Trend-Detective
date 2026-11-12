import { config } from '@/config'
import type { ApiErrorShape } from '@/types'

export class ApiError extends Error {
  code: string
  status: number

  constructor(shape: ApiErrorShape) {
    super(shape.message)
    this.code = shape.code
    this.status = shape.status
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${config.apiBaseUrl}${path}`
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
    if (!response.ok) {
      throw new ApiError({
        message: `Request failed (${response.status})`,
        code: 'http_error',
        status: response.status,
      })
    }
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError({
      message: error instanceof Error ? error.message : 'Network error',
      code: 'network',
      status: 0,
    })
  }
}
