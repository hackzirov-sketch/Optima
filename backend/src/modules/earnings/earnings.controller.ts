import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { EarningsService } from './earnings.service';
import { CreateEarningDto } from './dto/create-earning.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Earnings')
@ApiBearerAuth('access-token')
@Controller('workspaces/:workspaceId/earnings')
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get earnings summary for workspace' })
  @ApiParam({ name: 'workspaceId' })
  summary(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.earningsService.getSummary(workspaceId, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List earnings for workspace' })
  @ApiParam({ name: 'workspaceId' })
  list(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.earningsService.list(workspaceId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Add an earning record' })
  @ApiParam({ name: 'workspaceId' })
  create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateEarningDto,
  ) {
    return this.earningsService.create(workspaceId, userId, dto);
  }

  @Delete(':earningId')
  @ApiOperation({ summary: 'Delete an earning record' })
  @ApiParam({ name: 'workspaceId' })
  @ApiParam({ name: 'earningId' })
  remove(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('earningId', ParseUUIDPipe) earningId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.earningsService.remove(workspaceId, userId, earningId);
  }
}
