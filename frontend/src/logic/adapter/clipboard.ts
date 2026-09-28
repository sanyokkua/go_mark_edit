/** The native text clipboard boundary used by editor actions. */
export interface ClipboardPort {
    readText: () => Promise<string>;
    writeText: (text: string) => Promise<boolean>;
}

export interface ClipboardBindings {
    getText: () => Promise<string>;
    setText: (text: string) => Promise<boolean>;
}

export function createClipboardPort(bindings: ClipboardBindings): ClipboardPort {
    return {
        readText: (): Promise<string> => bindings.getText(),
        writeText: (text: string): Promise<boolean> => bindings.setText(text),
    };
}
