interface Config {
  enabled: boolean;
}

export function sync(config: Config, items: number[]) {
  if (!config.enabled) return;
  const batch = items.slice(0, 10);
  const total = batch.length;
  console.log(total);
}

export function split(config: Config, items: number[]) {
  if (!config.enabled) {
    throw new Error('off');
  }
  const batch = items.slice(0, 10);
  console.log(batch);
  const started = Date.now();
  console.log(Date.now() - started);
}

export function branch(config: Config, items: number[]) {
  if (!config.enabled) console.log('off');
  const batch = items.slice(0, 10);
  console.log(batch);
}
