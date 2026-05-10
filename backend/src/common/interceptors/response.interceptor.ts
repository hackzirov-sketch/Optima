import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  success: boolean;
  data: T;
  meta?: any;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => {
        // If the data already has a specific structure (like pagination), handle it
        if (data && data.results && data.meta) {
          return {
            success: true,
            data: data.results,
            meta: data.meta,
          };
        }

        return {
          success: true,
          data: data || {},
        };
      }),
    );
  }
}
