import { TaskStatus } from '../../common/enums';
import { Project } from './project.entity';

export interface ProjectColumn {
  id: string;

  projectId: string;

  project: Project;

  name: string;

  color: string;

  position: number;

  isDefault: boolean;

  mapsToStatus: TaskStatus | null;

  createdAt: Date;

  updatedAt: Date;
}
