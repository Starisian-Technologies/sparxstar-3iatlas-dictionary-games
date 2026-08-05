/**
 * Minimal renderHook — this repo has no @testing-library/react-hooks (and no
 * tests existed at all before Phase 3), so this reimplements just enough of
 * it with react-dom (already a dependency) to exercise a hook under a real
 * render/act cycle.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export function renderHook(useHookFn, initialProps) {
    const result = {};
    const container = document.createElement('div');
    const root = createRoot(container);

    function TestComponent(props) {
        result.current = useHookFn(props);
        return null;
    }

    act(() => {
        root.render(<TestComponent {...initialProps} />);
    });

    return {
        result,
        rerender: (newProps) => act(() => root.render(<TestComponent {...newProps} />)),
        unmount: () => act(() => root.unmount()),
    };
}
