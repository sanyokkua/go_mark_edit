export function guardArity<TArgs extends unknown[], TResult>(
  methodName: string,
  bound: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  const expectedArity = bound.length;

  return (...args: TArgs): Promise<TResult> => {
    if (args.length !== expectedArity) {
      return Promise.reject(
        new Error(
          `${methodName} expects ${expectedArity} argument(s), received ${args.length}.`,
        ),
      );
    }

    return bound(...args);
  };
}
