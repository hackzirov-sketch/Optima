import { MeetingAccessService } from './services/meeting-access.service';
import { MeetingJoinRequestStatus } from '../../common/enums/meeting.enum';

/**
 * A rejection you can re-send instantly is not a rejection — every request
 * notifies the host and every co-host, so it doubles as a way to spam people
 * mid-call.
 */
describe('MeetingAccessService — post-rejection cooldown', () => {
  const service = new MeetingAccessService({} as never);

  const approvalFor = (reviewedAt: Date | null) =>
    service.describeAccess({
      kind: 'approval',
      joinRequest: {
        id: 'req-1',
        status: MeetingJoinRequestStatus.REJECTED,
        reviewedAt,
      },
    });

  it('holds a just-rejected requester off', () => {
    const access = approvalFor(new Date());

    expect(access.canRequest).toBe(false);
    // Reported so the button can show the wait instead of failing on click.
    expect(access.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('lets them ask again once the window has passed', () => {
    const access = approvalFor(new Date(Date.now() - 10 * 60 * 1000));

    expect(access.canRequest).toBe(true);
    expect(access.retryAfterSeconds).toBe(0);
  });

  it('does not throttle someone who has never been reviewed', () => {
    expect(service.rejectionCooldownRemaining(null)).toBe(0);
  });

  it('still blocks a pending request from being re-sent', () => {
    const access = service.describeAccess({
      kind: 'approval',
      joinRequest: {
        id: 'req-1',
        status: MeetingJoinRequestStatus.PENDING,
        reviewedAt: null,
      },
    });

    expect(access.canRequest).toBe(false);
  });
});
