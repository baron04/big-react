import type { ReactElement } from 'shared/ReactTypes';

import { createRoot } from 'react-dom/client';

export function renderIntoDocument(element: ReactElement) {
	const div = document.createElement('div');
	// element
	return createRoot(div).render(element);
}
