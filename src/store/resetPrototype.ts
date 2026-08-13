const CATCHUP_STORAGE_PREFIXES = ["catchup.", "catchup:"] as const;

function removeCatchUpEntries(storage: Storage) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key))
    .filter((key) => CATCHUP_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)));
  for (const key of keys) storage.removeItem(key);
}

export function resetCatchUpPrototype(options: {
  localStorage?: Storage;
  sessionStorage?: Storage;
  reload?: () => void;
} = {}) {
  const localStorage = options.localStorage ?? window.localStorage;
  const sessionStorage = options.sessionStorage ?? window.sessionStorage;
  removeCatchUpEntries(localStorage);
  removeCatchUpEntries(sessionStorage);
  (options.reload ?? (() => window.location.replace("/?resetDemo=1")))();
}
