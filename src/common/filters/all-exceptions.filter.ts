import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { Request, Response } from 'express';

interface ErrorResponse {
  success: false;
  statusCode: number;
  error: string;
  message: string | string[];
  timestamp: string;
  path: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, error, message } = this.resolveError(exception);

    this.logger.error(
      `${request.method} ${request.url} → ${statusCode} ${error}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    const body: ErrorResponse = {
      success: false,
      statusCode,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(body);
  }

  private resolveError(exception: unknown): {
    statusCode: number;
    error: string;
    message: string | string[];
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const raw = exception.getResponse();

      if (raw != null && typeof raw === 'object') {
        const cast = raw as Record<string, unknown>;
        const errorVal = cast['error'];
        return {
          statusCode,
          error: typeof errorVal === 'string' ? errorVal : exception.name,
          message: (cast['message'] as string | string[]) ?? exception.message,
        };
      }

      return {
        statusCode,
        error: exception.name,
        message: String(raw),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.resolvePrismaKnownError(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Validation Error',
        message: 'Invalid data provided to the database query.',
      };
    }

    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Database Unavailable',
        message: 'Unable to connect to the database.',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
    };
  }

  private resolvePrismaKnownError(
    exception: Prisma.PrismaClientKnownRequestError,
  ): { statusCode: number; error: string; message: string } {
    switch (exception.code) {
      case 'P2002': {
        const meta = exception.meta as { target?: string[] };
        const fields = meta?.target?.join(', ');
        return {
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: fields
            ? `A record with this ${fields} already exists.`
            : 'A record with a unique constraint already exists.',
        };
      }
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: 'The requested record does not exist.',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'A related record does not exist (foreign key constraint).',
        };
      case 'P2014':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'The change violates a required relation.',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Database Error',
          message: `A database error occurred (${exception.code}).`,
        };
    }
  }
}
