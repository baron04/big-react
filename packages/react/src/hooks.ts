import { Dispatcher, resolveDispatcher } from './currentDispatcher';

export const useState: Dispatcher['useState'] = (initialState) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useState(initialState);
};

export const useEffect: Dispatcher['useEffect'] = (create, deps) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useEffect(create, deps);
};

export const useTransition: Dispatcher['useTransition'] = () => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useTransition();
};

export const useRef: Dispatcher['useRef'] = (initialValue) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useRef(initialValue);
};

export const useContext: Dispatcher['useContext'] = (context) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useContext(context);
};

export const use: Dispatcher['use'] = (usable) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.use(usable);
};

export const useCallback: Dispatcher['useCallback'] = (callback, deps) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useCallback(callback, deps);
};

export const useMemo: Dispatcher['useMemo'] = (nextCreate, deps) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useMemo(nextCreate, deps);
};
