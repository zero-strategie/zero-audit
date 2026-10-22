export interface SmokeStep {
  readonly name: string;
  readonly run: () => void | Promise<void>;
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Runs the steps in order; returns a message naming the first failing step, or null. Always cleans up. */
export const runSteps = async (
  steps: readonly SmokeStep[],
  cleanup: () => void | Promise<void>,
): Promise<string | null> => {
  try {
    for (const step of steps) {
      try {
        await step.run();
      } catch (error) {
        return `step "${step.name}" failed: ${describeError(error)}`;
      }
    }
    return null;
  } finally {
    await cleanup();
  }
};
