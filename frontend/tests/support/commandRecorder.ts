export interface RecordedBindingCall {
  name: string;
  requestId: string;
  args: readonly unknown[];
}

export interface CommandRecorder {
  calls: RecordedBindingCall[];
  binding<TArgs extends readonly unknown[]>(
    name: string,
    argumentCount?: number,
  ): (request: { id: string }, ...args: TArgs) => Promise<never>;
}

export function createCommandRecorder(): CommandRecorder {
  const calls: RecordedBindingCall[] = [];

  return {
    calls,
    binding<TArgs extends readonly unknown[]>(
      name: string,
      argumentCount = 0,
    ): (request: { id: string }, ...args: TArgs) => Promise<never> {
      const binding = (
        request: { id: string },
        ...args: TArgs
      ): Promise<never> => {
        calls.push({ name, requestId: request.id, args });
        return new Promise<never>(() => undefined);
      };
      Object.defineProperty(binding, 'length', {
        configurable: true,
        value: argumentCount + 1,
      });
      return binding;
    },
  };
}
