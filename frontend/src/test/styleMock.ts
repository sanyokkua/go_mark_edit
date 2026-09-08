const styles: Record<string, string> = new Proxy(
  {},
  {
    get: (_target: Record<string, string>, property: string): string =>
      property,
  },
);

export default styles;
