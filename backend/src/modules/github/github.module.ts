import { Module } from '@nestjs/common';
import { GithubController } from './github.controller';
import { GithubWebhookAliasController } from './github-webhook-alias.controller';
import { GithubService } from './github.service';

@Module({
  controllers: [GithubController, GithubWebhookAliasController],
  providers: [GithubService],
  exports: [GithubService],
})
export class GithubModule {}
