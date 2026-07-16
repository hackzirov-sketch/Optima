import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { User } from '../../../database/entities/user.entity';
import { USER_COLUMNS_SQL, mapUserRow } from '../../users/repositories/users.sql';

@Injectable()
export class AuthRepository {
  constructor(private readonly dataSource: DatabaseService) {}

  /** Locks the user row, flips is_verified/needs_password_setup, all in one
   * transaction so a concurrent verify attempt can't race the same user. */
  async verifyAndActivateUser(
    userId: string,
  ): Promise<{ user: User; needsPasswordSetup: boolean }> {
    return this.dataSource.withTransaction(async (query) => {
      const userRows: Array<User & { passwordHash: string | null }> = await query(
        `SELECT ${USER_COLUMNS_SQL}, password_hash AS "passwordHash"
         FROM users WHERE id = $1 FOR UPDATE`,
        [userId],
      );
      const user = userRows[0] && mapUserRow(userRows[0]);
      if (!user) {
        throw new BadRequestException({
          code: ErrorCode.TOKEN_INVALID,
          message: 'Invalid or expired verification token',
        });
      }

      const needsPasswordSetup = !user.passwordHash;

      await query(
        `UPDATE users SET is_verified = true, needs_password_setup = $2, updated_at = now() WHERE id = $1`,
        [user.id, needsPasswordSetup],
      );

      return { user, needsPasswordSetup };
    });
  }
}
