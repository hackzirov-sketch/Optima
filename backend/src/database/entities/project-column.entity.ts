import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TaskStatus } from '../../common/enums';
import { Project } from './project.entity';

@Entity('project_columns')
export class ProjectColumn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id' })
  projectId: string;

  @ManyToOne(() => Project, (project) => project.columns, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 7, nullable: true })
  color: string;

  @Column({ type: 'smallint', default: 0 })
  position: number;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({
    name: 'maps_to_status',
    type: 'enum',
    enum: TaskStatus,
    nullable: true,
  })
  mapsToStatus: TaskStatus | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
