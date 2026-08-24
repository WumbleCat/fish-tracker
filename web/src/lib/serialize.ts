/** One in-flight write per resource. Later calls queue behind earlier ones
 * so three rapid clicks reach the server in order and never race each
 * other; a failed call doesn't block the ones queued behind it. */

const chains = new Map<string, Promise<unknown>>();

export function serialize<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  chains.set(key, next);
  void next.then(
    () => {
      if (chains.get(key) === next) chains.delete(key);
    },
    () => {
      if (chains.get(key) === next) chains.delete(key);
    },
  );
  return next;
}
