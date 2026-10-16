import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, type z } from 'zod';
import { Prisma } from '@prisma/client';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'Not allowed') => new AppError(403, 'forbidden', message);
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (message: string) => new AppError(409, 'conflict', message);
export const unavailable = (code: string, message: string) => new AppError(503, code, message);

/** Parse with a Zod schema, converting failures into a 400 with field details. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(400, 'validation_error', 'Invalid request', formatZodIssues(result.error));
  }
  return result.data;
}

export function formatZodIssues(error: ZodError) {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
    });
  }
  if (error instanceof ZodError) {
    return reply
      .status(400)
      .send({ error: { code: 'validation_error', message: 'Invalid request', details: formatZodIssues(error) } });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') return reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } });
    if (error.code === 'P2002') return reply.status(409).send({ error: { code: 'conflict', message: 'Already exists' } });
  }
  const fe = error as FastifyError;
  if (fe.statusCode === 429) {
    return reply.status(429).send({ error: { code: 'rate_limited', message: 'Too many requests, slow down' } });
  }
  if (fe.validation || (fe.statusCode && fe.statusCode >= 400 && fe.statusCode < 500)) {
    return reply.status(fe.statusCode ?? 400).send({ error: { code: fe.code ?? 'bad_request', message: fe.message } });
  }
  request.log.error({ err: error }, 'Unhandled error');
  return reply.status(500).send({ error: { code: 'internal_error', message: 'Something went wrong on our side' } });
}
