/**
 * SP-M8x Hybrid Music Production Suite
 * projectController.ts — Centralized Pub/Sub Project Controller
 */

import { Project } from './projectTypes';
import { ProjectAction } from './projectActions';
import { projectReducer } from './projectReducer';
import { initialProject } from './initialProject';

type Listener = (state: Project) => void;

class ProjectController {
  private state: Project;
  private listeners: Set<Listener> = new Set();

  constructor(initialState: Project = initialProject) {
    this.state = initialState;
  }

  public getState = (): Project => {
    return this.state;
  };

  public dispatch = (action: ProjectAction): void => {
    this.state = projectReducer(this.state, action);
    this.listeners.forEach((listener) => listener(this.state));
  };

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    // Return unsubscribe callback
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export const projectController = new ProjectController();