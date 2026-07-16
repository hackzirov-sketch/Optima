import { Project } from './project.entity';

export interface TaskSequence {
  projectId: string;

  project: Project;

  lastNumber: number;
}
