import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GithubController } from './github.controller';
import { GithubWebhookAliasController } from './github-webhook-alias.controller';
import { GithubService } from './github.service';
import { TaskPush } from '../../database/entities/task-push.entity';
import { Repository } from '../../database/entities/repository.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TaskPush, Repository])],
  controllers: [GithubController, GithubWebhookAliasController],
  providers: [GithubService],
  exports: [GithubService],
})
export class GithubModule {}
