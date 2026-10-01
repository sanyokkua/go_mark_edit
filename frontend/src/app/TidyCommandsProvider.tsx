import type { PropsWithChildren } from 'react';

import { TidyCommandsContext } from '../ui/widgets/tidyCommandsContext';
import { useTidyCommands } from './useTidyCommands';

export function TidyCommandsProvider({ children }: PropsWithChildren): React.JSX.Element {
    const commands = useTidyCommands();
    return <TidyCommandsContext.Provider value={commands}>{children}</TidyCommandsContext.Provider>;
}
