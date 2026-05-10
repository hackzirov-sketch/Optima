import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorCode } from '../enums/error-code.enum';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = ErrorCode.INTERNAL_ERROR;
    let details = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse: any = exception.getResponse();

      message = exceptionResponse.message || exception.message;
      code = exceptionResponse.code || ErrorCode.INTERNAL_ERROR;
      details = exceptionResponse.errors || null;

      // Handle class-validator errors
      if (status === HttpStatus.BAD_REQUEST && Array.isArray(exceptionResponse.message)) {
        message = 'Validation failed';
        code = ErrorCode.VALIDATION_ERROR;
        details = exceptionResponse.message;
      }
    } else {
      // Log non-HTTP errors for debugging
      console.error('Unhandled Exception:', exception);
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        details,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    });
  }
}
