import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { PushesService } from './pushes.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SubmitPushDto } from './dto/submit-push.dto';
import { ReviewPushDto } from './dto/review-push.dto';
import { AddReviewCommentDto } from './dto/add-review-comment.dto';
import { UpdatePushCommentDto } from './dto/update-push-comment.dto';
import { ListPushesQueryDto } from './dto/list-pushes-query.dto';

@ApiTags('Pushes')
@ApiBearerAuth('access-token')
@Controller('pushes')
export class PushesController {
  constructor(private readonly pushesService: PushesService) {}

  @Get()
  @ApiOperation({ summary: 'List pushes submitted by the current user' })
  listMine(@CurrentUser('id') userId: string, @Query() q: ListPushesQueryDto) {
    return this.pushesService.listMine(userId, q);
  }

  @Post()
  @ApiOperation({ summary: 'Submit a push for UPZ review (CLI / UI)' })
  submit(@CurrentUser('id') userId: string, @Body() dto: SubmitPushDto) {
    return this.pushesService.submit(userId, dto);
  }

  @Get(':pushId')
  @ApiOperation({ summary: 'Get push by id' })
  @ApiParam({ name: 'pushId' })
  getOne(@Param('pushId') pushId: string, @CurrentUser('id') userId: string) {
    return this.pushesService.getById(pushId, userId);
  }

  @Get(':pushId/download')
  @ApiOperation({ summary: 'Presigned URL to download diff artifact from R2' })
  download(@Param('pushId') pushId: string, @CurrentUser('id') userId: string) {
    return this.pushesService.presignedDownload(pushId, userId);
  }

  @Patch(':pushId/approve')
  @ApiOperation({ summary: 'Approve push (owner / admin / lead)' })
  approve(@Param('pushId') pushId: string, @CurrentUser('id') userId: string) {
    return this.pushesService.approve(pushId, userId);
  }

  @Patch(':pushId/reject')
  @ApiOperation({ summary: 'Reject push (owner / admin / lead)' })
  reject(
    @Param('pushId') pushId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReviewPushDto,
  ) {
    return this.pushesService.reject(pushId, userId, dto);
  }

  @Get(':pushId/comments')
  @ApiOperation({ summary: 'List inline review comments' })
  listComments(
    @Param('pushId') pushId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.pushesService.listComments(pushId, userId);
  }

  @Post(':pushId/comments')
  @ApiOperation({ summary: 'Add review comment' })
  addComment(
    @Param('pushId') pushId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddReviewCommentDto,
  ) {
    return this.pushesService.addComment(pushId, userId, dto);
  }

  @Patch(':pushId/comments/:commentId')
  @ApiOperation({ summary: 'Update own comment (or resolve flags if allowed)' })
  patchComment(
    @Param('pushId') pushId: string,
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdatePushCommentDto,
  ) {
    return this.pushesService.updateComment(pushId, commentId, userId, dto);
  }

  @Delete(':pushId/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete own comment' })
  async deleteComment(
    @Param('pushId') pushId: string,
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.pushesService.deleteComment(pushId, commentId, userId);
  }

  @Patch(':pushId/comments/:commentId/resolve')
  @ApiOperation({ summary: 'Mark comment resolved (reviewer roles)' })
  resolveComment(
    @Param('pushId') pushId: string,
    @Param('commentId') commentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.pushesService.resolveComment(pushId, commentId, userId);
  }
}
