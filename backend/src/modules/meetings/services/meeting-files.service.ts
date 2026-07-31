import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { StorageService } from '../../storage/storage.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { normalizeReturning } from '../../../common/utils/sql.util';

@Injectable()
export class MeetingFilesService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly storageService: StorageService,
  ) {}

  private async assertMeetingParticipant(meetingId: string, userId: string) {
    const rows = await this.dataSource.query(
      `SELECT m.id
       FROM meetings m
       LEFT JOIN meeting_participants p
         ON p.meeting_id = m.id AND p.user_id = $2 AND p.left_at IS NULL
       WHERE m.id = $1 AND (m.host_id = $2 OR p.id IS NOT NULL)`,
      [meetingId, userId],
    );
    if (!rows[0]) {
      throw new ForbiddenException({
        code: ErrorCode.MEETING_NOT_PARTICIPANT,
        message: 'Join the meeting before sharing files',
      });
    }
  }

  async presignSharedFile(
    meetingId: string,
    userId: string,
    fileName: string,
    mimeType: string,
    fileSize: number,
  ) {
    await this.assertMeetingParticipant(meetingId, userId);
    return this.storageService.getPresignedUploadUrl(
      'meeting-files',
      userId,
      fileName,
      mimeType,
      fileSize,
    );
  }

  async shareFile(
    meetingId: string,
    userId: string,
    file: {
      fileName: string;
      mimeType: string;
      fileSize: number;
      storageKey: string;
      storageUrl: string;
    },
  ) {
    await this.assertMeetingParticipant(meetingId, userId);
    if (!file.storageKey.startsWith(`meeting-files/${userId}/`)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid meeting file key',
      });
    }
    if (!file.storageUrl.endsWith(`/${file.storageKey}`)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid meeting file URL',
      });
    }
    const rows = normalizeReturning(
      await this.dataSource.query(
        `INSERT INTO meeting_shared_files
         (meeting_id, shared_by, file_name, mime_type, file_size, storage_key, storage_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, meeting_id AS "meetingId", shared_by AS "sharedBy", file_name AS "fileName",
                 mime_type AS "mimeType", file_size::text AS "fileSize", storage_url AS "storageUrl", created_at AS "createdAt"`,
        [
          meetingId,
          userId,
          file.fileName,
          file.mimeType,
          file.fileSize,
          file.storageKey,
          file.storageUrl,
        ],
      ),
    );
    return rows[0];
  }

  async listSharedFiles(meetingId: string, userId: string) {
    await this.assertMeetingParticipant(meetingId, userId);
    return this.dataSource.query(
      `SELECT f.id, f.meeting_id AS "meetingId", f.shared_by AS "sharedBy", f.file_name AS "fileName",
              f.mime_type AS "mimeType", f.file_size::text AS "fileSize", f.storage_url AS "storageUrl",
              f.created_at AS "createdAt", u.first_name AS "firstName", u.last_name AS "lastName"
       FROM meeting_shared_files f
       JOIN users u ON u.id = f.shared_by
       WHERE f.meeting_id = $1
       ORDER BY f.created_at DESC
       LIMIT 100`,
      [meetingId],
    );
  }
}
