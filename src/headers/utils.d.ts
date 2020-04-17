declare namespace sc.ru {
  function objectFromEntries<K extends PropertyKey = PropertyKey, T = unknown>(
    entries: ReadonlyArray<readonly [K, T]>,
  ): Record<K, T>;

  function insertAfterOrAppend<T>(
    array: T[],
    index: number,
    ...items: T[]
  ): void;

  function waitForLoadable<T extends ig.Loadable | ig.SingleLoadable>(
    loadable: T,
  ): Promise<T>;
}
