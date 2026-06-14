import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import * as crypto from 'crypto';

import { TaskPush } from '../../database/entities/task-push.entity';
import { Repository as LinkedRepository } from '../../database/entities/repository.entity';
import { PushStatus } from '../../common/enums';

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(TaskPush)
    private readonly pushRepo: Repository<TaskPush>,
    @InjectRepository(LinkedRepository)
    private readonly repoEntity: Repository<LinkedRepository>,
  ) {}

  verifyWebhookSignature(
    rawBody: Buffer | undefined,
    signatureHeader: string | undefined,
  ): void {
    const secret = this.configService.get<string>('github.webhookSecret');
    if (!secret) {
      throw new UnauthorizedException(
        'GITHUB_APP_WEBHOOK_SECRET is not configured — webhook rejected',
      );
    }

    if (!signatureHeader) {
      throw new UnauthorizedException({ code: ErrorCode.GITHUB_SIGNATURE_MISSING, message: 'Missing X-Hub-Signature-256 header' });
    }

    const body = rawBody ?? Buffer.alloc(0);
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(body).digest('hex');

    const a = Buffer.from(signatureHeader, 'utf8');
    const b = Buffer.from(digest, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException({ code: ErrorCode.GITHUB_SIGNATURE_INVALID, message: 'Invalid GitHub signature' });
    }
  }

  async handleWebhook(event: string, payload: Record<string, unknown>) {
    this.logger.log(`GitHub webhook: ${event}`);

    switch (event) {
      case 'push':
        await this.handlePushEvent(payload);
        break;
      case 'pull_request':
        await this.handlePullRequestEvent(payload);
        break;
      case 'installation':
      case 'installation_repositories':
        this.handleInstallationEvent(event, payload);
        break;
      default:
        break;
    }

    return { received: true, event };
  }

  private async handlePushEvent(payload: Record<string, unknown>) {
    const p = payload as {
      ref?: string;
      after?: string;
      repository?: { id?: number; full_name?: string };
      head_commit?: { id?: string };
    };

    const githubRepoId = p.repository?.id;
    const headSha = p.after || p.head_commit?.id;
    const branch = p.ref?.replace(/^refs\/heads\//, '');

    if (!githubRepoId || !headSha || !branch) {
      this.logger.debug('push webhook missing repo, branch, or commit sha');
      return;
    }

    const linkedRepo = await this.repoEntity.findOne({
      where: { githubRepoId },
    });
    if (!linkedRepo) {
      this.logger.debug(
        `No linked repository for GitHub id ${githubRepoId} (${p.repository?.full_name})`,
      );
      return;
    }

    const candidates = await this.pushRepo.find({
      where: {
        repositoryId: linkedRepo.id,
        branchName: branch,
        deletedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const push =
      candidates.find(
        (row) =>
          !row.githubCommitSha ||
          row.commitSha === headSha ||
          row.githubCommitSha === headSha,
      ) ?? candidates[0];

    if (!push) {
      this.logger.debug(
        `No UPZ push to link for ${p.repository?.full_name}@${branch}`,
      );
      return;
    }

    push.githubCommitSha = headSha;
    if (!push.commitSha) {
      push.commitSha = headSha;
    }
    await this.pushRepo.save(push);

    this.logger.log(
      `Linked GitHub push ${headSha.slice(0, 7)} to UPZ push ${push.id}`,
    );
  }

  private async handlePullRequestEvent(payload: Record<string, unknown>) {
    const p = payload as {
      action?: string;
      pull_request?: {
        number?: number;
        html_url?: string;
        merged?: boolean;
        head?: { ref?: string; sha?: string };
      };
      repository?: { id?: number; full_name?: string };
    };

    const githubRepoId = p.repository?.id;
    const pr = p.pull_request;
    if (!githubRepoId || !pr?.head?.ref) return;

    const linkedRepo = await this.repoEntity.findOne({
      where: { githubRepoId },
    });
    if (!linkedRepo) return;

    const push = await this.pushRepo.findOne({
      where: {
        repositoryId: linkedRepo.id,
        branchName: pr.head.ref,
        deletedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    if (!push) {
      this.logger.debug(
        `pull_request: no UPZ push for ${p.repository?.full_name} branch ${pr.head.ref}`,
      );
      return;
    }

    if (pr.html_url) push.githubPrUrl = pr.html_url;
    if (pr.number != null) push.githubPrNumber = pr.number;
    if (pr.head.sha) push.githubCommitSha = pr.head.sha;

    if (p.action === 'closed' && pr.merged) {
      if (push.status === PushStatus.APPROVED) {
        push.status = PushStatus.MERGED;
      }
    }

    await this.pushRepo.save(push);
    this.logger.log(
      `Updated UPZ push ${push.id} from PR #${pr.number} (${p.action})`,
    );
  }

  private handleInstallationEvent(
    event: string,
    payload: Record<string, unknown>,
  ) {
    const p = payload as {
      action?: string;
      installation?: { id?: number };
      repositories_added?: { full_name?: string }[];
    };
    this.logger.log(
      `${event} action=${p.action} installation=${p.installation?.id} repos_added=${p.repositories_added?.length ?? 0}`,
    );
  }
}
