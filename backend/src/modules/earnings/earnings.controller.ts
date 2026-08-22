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
@Controller('groups/:groupId/earnings')
export class EarningsController {
  constructor(private readonly earningsService: EarningsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get earnings summary for group' })
  @ApiParam({ name: 'groupId' })
  summary(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.earningsService.getSummary(groupId, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List earnings for group' })
  @ApiParam({ name: 'groupId' })
  list(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.earningsService.list(groupId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Add an earning record' })
  @ApiParam({ name: 'groupId' })
  create(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateEarningDto,
  ) {
    return this.earningsService.create(groupId, userId, dto);
  }

  @Delete(':earningId')
  @ApiOperation({ summary: 'Delete an earning record' })
  @ApiParam({ name: 'groupId' })
  @ApiParam({ name: 'earningId' })
  remove(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('earningId', ParseUUIDPipe) earningId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.earningsService.remove(groupId, userId, earningId);
  }
}
