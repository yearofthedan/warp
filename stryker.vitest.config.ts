import config from './vite.config.ts';

export default {
  ...config,
  test: {
    ...config.test,
    projects: config.test?.projects?.filter(
      (project) => typeof project === 'object' && 'test' in project && project.test?.name === 'unit',
    ),
  },
};
