import { Controller, Post, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InvitationsService } from '../services/invitations.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('Invitations')
@ApiBearerAuth('access-token')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post(':token/accept')
  @ApiOperation({ summary: 'Accept a group invitation' })
  acceptInvitation(
    @Param('token') token: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.invitationsService.accept(token, userId);
  }

  @Post(':token/decline')
  @ApiOperation({ summary: 'Decline a group invitation' })
  declineInvitation(
    @Param('token') token: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.invitationsService.decline(token, userId);
  }
}
