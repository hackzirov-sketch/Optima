import {
  Entity,
  PrimaryColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from './project.entity';

@Entity('task_sequences')
export class TaskSequence {
  @PrimaryColumn({ name: 'project_id' })
  projectId: string;

  @OneToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'last_number', default: 0 })
  lastNumber: number;
}
