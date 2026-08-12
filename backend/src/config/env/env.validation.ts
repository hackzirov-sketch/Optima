import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EnvironmentVariables } from './env.schema';

export function validate(config: Record<string, unknown>) {
  // A bare `KEY=` line means "not configured", and every reader in this
  // codebase already treats it that way — `if (process.env.TURN_SECRET)` and
  // friends. class-validator does not: @IsOptional() only skips null and
  // undefined, so an empty string still reached @MinLength(32) and refused to
  // boot the app over a variable nobody had asked for. That trap was baked
  // into .env.example, which ships TURN_SECRET, ENCRYPTION_KEY and
  // CHAT_ENCRYPTION_KEY as empty by design.
  const provided = Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== ''),
  );

  const validatedConfig = plainToInstance(EnvironmentVariables, provided, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
