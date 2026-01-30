import {
	createContainer,
	updateContainer
} from 'react-reconciler/src/fiberReconciler';
import { Container } from './hostConfig';
import { ReactElement } from 'shared/ReactTypes';
import { listenToAllSupportedEvents } from './SyntheticEvent';

export function createRoot(container: Container) {
	listenToAllSupportedEvents(container);
	const root = createContainer(container);

	return {
		render(element: ReactElement) {
			return updateContainer(element, root);
		}
	};
}
