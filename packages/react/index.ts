import currentDispatcher, {
	Dispatcher,
	resolveDispatcher
} from './src/currentDispatcher';
import { createElement } from './src/jsx';
import currentBatchConfig from './src/currentBatchConfig';
import { isValidElement } from './src/jsx';

const version = '0.0.0';

const useState: Dispatcher['useState'] = (initialState) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useState(initialState);
};

const useEffect: Dispatcher['useEffect'] = (create, deps) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useEffect(create, deps);
};

const useTransition: Dispatcher['useTransition'] = () => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useTransition();
};

const useRef: Dispatcher['useRef'] = (initialValue) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useRef(initialValue);
};

// 内部数据共享层
const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher,
	currentBatchConfig
};

export {
	isValidElement,
	version,
	createElement,
	useState,
	useEffect,
	useTransition,
	useRef,
	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
};

export default {
	isValidElement,
	version,
	createElement,
	useState,
	useEffect,
	useTransition,
	useRef,
	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
};
