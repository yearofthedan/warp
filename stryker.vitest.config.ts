import config from './vite.config.ts';

// Stryker runs the unit tier alone: the other tiers read the disk or spawn the CLI.
export default {
  ...config,
  test: {
    ...config.test,
    projects: config.test?.projects?.filter(
      (project) => typeof project === 'object' && 'test' in project && project.test?.name === 'unit',
    ),
  },
};
