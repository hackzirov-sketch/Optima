import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { ErrorCode } from '../enums/error-code.enum';
import { ConfigService } from '@nestjs/config';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  /** The only routes where an error should redirect the browser instead of
   * returning JSON — the user is mid-OAuth and has no client code to read a
   * response body. */
  private static readonly OAUTH_CALLBACK_PATHS = [
    '/auth/google/callback',
    '/auth/github/callback',
  ];

  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly configService: ConfigService) {}

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = ErrorCode.INTERNAL_ERROR;
    let details = null;

    let redirect: string | undefined;
    let requiresPasswordSetup: boolean | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse: any = exception.getResponse();

      message = exceptionResponse.message || exception.message;
      code = exceptionResponse.code || ErrorCode.INTERNAL_ERROR;
      details = exceptionResponse.errors || null;
      redirect = exceptionResponse.redirect;
      requiresPasswordSetup = exceptionResponse.requiresPasswordSetup;

      // Handle Zod validation errors (nestjs-zod's ZodValidationPipe/ZodValidationException)
      if (
        status === HttpStatus.BAD_REQUEST &&
        Array.isArray(exceptionResponse.errors)
      ) {
        message = 'Validation failed';
        code = ErrorCode.VALIDATION_ERROR;
        details = exceptionResponse.errors.map(
          (issue: any) =>
            `${issue.path?.join('.') || 'value'}: ${issue.message}`,
        );
      } else if (
        status === HttpStatus.BAD_REQUEST &&
        Array.isArray(exceptionResponse.message)
      ) {
        message = 'Validation failed';
        code = ErrorCode.VALIDATION_ERROR;
        details = exceptionResponse.message;
      }
    } else if (exception?.code === '23505') {
      // Postgres unique_violation — raised directly by the `pg` driver on
      // raw queries (no ORM wrapping a "QueryFailedError" around it here).
      status = HttpStatus.CONFLICT;
      code = ErrorCode.DUPLICATE_ENTRY;
      message = 'Duplicate entry — this resource already exists';
    } else if (exception instanceof TokenExpiredError) {
      status = HttpStatus.UNAUTHORIZED;
      code = ErrorCode.TOKEN_EXPIRED;
      message = 'Token has expired';
    } else if (exception instanceof JsonWebTokenError) {
      status = HttpStatus.UNAUTHORIZED;
      code = ErrorCode.TOKEN_INVALID;
      message = 'Invalid token';
    } else if (
      exception?.name === 'TokenError' ||
      exception?.name === 'AuthorizationError' ||
      exception?.name === 'OAuthError'
    ) {
      message = exception.message || 'Authentication failed';
      code = ErrorCode.INVALID_CREDENTIALS;
    } else {
      // Log non-HTTP errors for debugging
      this.logger.error(
        'Unhandled Exception',
        exception instanceof Error ? exception.stack : exception,
      );
    }

    // Handle OAuth callback redirects.
    //
    // Scoped to the two real callback routes rather than `url.includes(
    // '/callback')`: that matched any GET path with "/callback" anywhere in it
    // — including query strings — so an unrelated endpoint's error turned into
    // a 302 to the login page instead of the JSON body its caller was parsing.
    const isOAuthCallback =
      request.method === 'GET' &&
      AllExceptionsFilter.OAUTH_CALLBACK_PATHS.some((path) =>
        request.path.endsWith(path),
      );
    const isOAuthError =
      exception?.name === 'TokenError' ||
      exception?.name === 'AuthorizationError' ||
      exception?.name === 'OAuthError';

    if (isOAuthCallback || isOAuthError) {
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        this.configService.get<string>('app.frontendUrl');
      const errorMsg = encodeURIComponent(message);
      return response.redirect(`${frontendUrl}/login?error=${errorMsg}`);
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        details,
        ...(redirect !== undefined && { redirect }),
        ...(requiresPasswordSetup !== undefined && { requiresPasswordSetup }),
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    });
  }
}
