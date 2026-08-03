import {
  ArgumentMetadata,
  INestApplication,
  Injectable,
  PipeTransform,
  ValidationPipe,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';

/**
 * Modules are being migrated from class-validator DTOs to Zod
 * (nestjs-zod's createZodDto) one at a time. Routing to the right pipe by
 * metatype — rather than just chaining both pipes — matters because
 * class-validator's `whitelist: true` strips every property off a Zod DTO
 * (it has no class-validator decorators, so all of its fields look
 * "unknown" to class-validator) and `forbidNonWhitelisted` then rejects the
 * request outright. Once every module is converted, delete this and use
 * ZodValidationPipe alone (plus drop class-validator/class-transformer).
 */
@Injectable()
class DualValidationPipe implements PipeTransform {
  private readonly zodPipe = new ZodValidationPipe();
  private readonly classValidatorPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  transform(value: unknown, metadata: ArgumentMetadata) {
    const metatype = metadata.metatype as { isZodDto?: boolean } | undefined;
    if (metatype?.isZodDto) return this.zodPipe.transform(value, metadata);
    return this.classValidatorPipe.transform(value, metadata);
  }
}

export function setupValidation(
  app: INestApplication,
  config: ConfigService,
): void {
  app.useGlobalPipes(new DualValidationPipe());

  // Serialization & response wrapping
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new ResponseInterceptor(),
  );

  // Exception Filters
  app.useGlobalFilters(new AllExceptionsFilter(config));
}
