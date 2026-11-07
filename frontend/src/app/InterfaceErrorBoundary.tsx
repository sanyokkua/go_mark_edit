import { Component, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback: ReactNode;
    onError: () => void;
}

/** Contains a failed application subtree while its state owners remain mounted. */
export default class InterfaceErrorBoundary extends Component<Props, { failed: boolean }> {
    state = { failed: false };

    static getDerivedStateFromError(): { failed: boolean } {
        return { failed: true };
    }

    componentDidCatch(): void {
        this.props.onError();
    }

    render(): ReactNode {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}
