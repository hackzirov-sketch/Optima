import { Project } from './project.entity';
import { User } from './user.entity';

export type ProjectMemberRole = 'manager' | 'member';
export type ProjectMemberStatus = 'pending' | 'accepted' | 'declined';

export interface ProjectMember {
  id: string;

  projectId: string;

  project: Project;

  userId: string;

  user: User;

  role: ProjectMemberRole;

  status: ProjectMemberStatus;

  invitedBy: string | null;

  inviter: User | null;

  invitedAt: Date;

  joinedAt: Date | null;
}
