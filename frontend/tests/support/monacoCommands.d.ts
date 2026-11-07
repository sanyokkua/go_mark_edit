/** The subset of Monaco's internal command registry used by the registration test. */
declare module 'monaco-editor/esm/vs/platform/commands/common/commands' {
    export const CommandsRegistry: {
        getCommand(id: string): { id: string } | undefined;
    };
}
