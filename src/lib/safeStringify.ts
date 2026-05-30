export function safeStringify(obj: unknown): string {
  return JSON.stringify(
    obj,
    (_key, value) => {
      if (typeof value === 'bigint') return value.toString();
      if (value instanceof Uint8Array) {
        return Array.from(value)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ');
      }
      return value;
    },
    2,
  );
}
