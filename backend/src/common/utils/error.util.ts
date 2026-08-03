import { ErrorCode } from '../enums/error-code.enum';

/** The `{ code, message }` body this codebase throws inside HttpExceptions. */
export interface ErrorDetails {
  code: string;
  message: string;
}

interface HttpExceptionLike {
  getResponse: () => unknown;
  message?: unknown;
}

function hasGetResponse(err: unknown): err is HttpExceptionLike {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { getResponse?: unknown }).getResponse === 'function'
  );
}

/**
 * Pulls the `{ code, message }` pair out of a thrown value.
 *
 * Callers that need to turn an exception into a WebSocket `error` event or a
 * redirect were each reaching into `err.response.code` / `err.getResponse()`
 * on an `any`, which meant a typo or a shape change surfaced as `undefined`
 * at runtime rather than as a compile error. This narrows once, in one place,
 * and always yields something sendable.
 *
 * @param fallbackCode Used when the thrown value carries no structured code —
 *   an unexpected error, not one of ours.
 */
export function extractErrorDetails(
  err: unknown,
  fallbackCode: string = ErrorCode.INTERNAL_ERROR,
  fallbackMessage = 'Something went wrong',
): ErrorDetails {
  let body: unknown = err;

  if (hasGetResponse(err)) {
    body = err.getResponse();
  } else if (typeof err === 'object' && err !== null && 'response' in err) {
    body = err.response;
  }

  const code =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { code?: unknown }).code === 'string'
      ? (body as { code: string }).code
      : fallbackCode;

  const message =
    (typeof body === 'object' &&
    body !== null &&
    typeof (body as { message?: unknown }).message === 'string'
      ? (body as { message: string }).message
      : undefined) ??
    (err instanceof Error ? err.message : undefined) ??
    fallbackMessage;

  return { code, message };
}
