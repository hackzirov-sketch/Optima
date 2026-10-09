import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CreateRoomKeyEpochDto, RegisterDeviceDto } from '../dto/e2ee.dto';
import { ChatE2eeService } from './e2ee.service';

@ApiTags('Chat E2EE')
@ApiBearerAuth('access-token')
@Controller('chat')
export class ChatE2eeController {
  constructor(private readonly e2ee: ChatE2eeService) {}

  @Put('e2ee/devices')
  @ApiOperation({ summary: 'Register this device’s ECDH public key' })
  registerDevice(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.e2ee.registerDevice(userId, dto);
  }

  @Get('rooms/:roomId/e2ee')
  @ApiOperation({
    summary:
      'E2EE state of a room: enabled?, room keys wrapped for this device, member devices',
  })
  roomState(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Query('deviceId') deviceId?: string,
  ) {
    return this.e2ee.getRoomState(roomId, userId, deviceId);
  }

  @Post('rooms/:roomId/e2ee/epochs')
  @ApiOperation({
    summary: 'Publish a new room key, wrapped per member device',
  })
  createEpoch(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateRoomKeyEpochDto,
  ) {
    return this.e2ee.createEpoch(roomId, userId, dto);
  }
}
