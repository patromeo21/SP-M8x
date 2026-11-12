  /** Ensure loaded legacy projects have the backing phrase length required by the 4-page tracker. */
  private normalizePhraseLengths(state: ProjectState): ProjectState {
    state.tracker.patterns.forEach((pattern) => {
      if (pattern.steps.length < 64) {
        const existingSteps = pattern.steps;
        pattern.steps = Array.from({ length: 64 }, (_, index) => existingSteps[index] ?? ({
          note: '---',
          sampleId: '--',
          subTickOffset: 0,
          velocity: 127,
          instrumentAssignmentId: null,
        }));
      } else if (pattern.steps.length > 64) {
        pattern.steps = pattern.steps.slice(0, 64);
      }
    });
    return state;
  }

