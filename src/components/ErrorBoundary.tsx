import * as React from "react";
import { Notice } from "obsidian";

interface Props {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("[NEI Chat ErrorBoundary]", error, errorInfo);
        new Notice(`❌ NEI Chat Error: ${error.message}`);
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return (
                <div style={{ padding: "16px", color: "var(--text-error, red)", textAlign: "center" }}>
                    <h3>⚠️ NEI Chat Component Error</h3>
                    <p style={{ fontSize: "12px", opacity: 0.8 }}>{this.state.error?.message || "An unknown error occurred."}</p>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        style={{ marginTop: "8px", padding: "4px 12px", cursor: "pointer" }}
                    >
                        🔄 Reset UI
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
