/**
 * SP-M8x Project Architecture
 * A1.2 — Centralized Pub/Sub Project Controller
 */

import type { SPProject } from './projectTypes';
import type { ProjectAction } from './projectActions';
import { projectReducer } from './projectReducer';
import { createInitialProject } from './initialProject';

type Listener = (state: SPProject) => void;

class ProjectController {
  private state: SPProject;
  private listeners: Set<Listener> = new Set();

  constructor(initialState: SPProject = createInitialProject()) {
    this.state = initialState;
  }

  public getState = (): SPProject => {
    return this.state;
  };

  public dispatch = (action: ProjectAction): void => {
    this.state = projectReducer(this.state, action);
    this.listeners.forEach((listener) => listener(this.state));
  };

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

export const projectController = new ProjectController();