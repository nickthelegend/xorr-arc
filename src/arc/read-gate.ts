/** Discard results from a previous wallet or older results arriving after newer reads. */
export function createReadGate() {
  let generation = 0;
  let sequence = 0;
  let committed = 0;
  return {
    invalidate() { generation++; sequence = 0; committed = 0; },
    begin() {
      const startedIn = generation;
      const id = ++sequence;
      return () => {
        if (generation !== startedIn || id < committed) return false;
        committed = id;
        return true;
      };
    },
  };
}
