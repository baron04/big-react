import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbols';
import currentDispatcher, {
	Dispatcher,
	resolveDispatcher
} from './src/currentDispatcher';
import { createElement } from './src/jsx';
import currentBatchConfig from './src/currentBatchConfig';

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

// 内部数据共享层
const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher,
	currentBatchConfig
};

function isValidElement(object: any) {
	return (
		typeof object === 'object' &&
		object !== null &&
		object.$$typeof === REACT_ELEMENT_TYPE
	);
}

export {
	version,
	createElement,
	useState,
	useEffect,
	useTransition,
	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
	isValidElement
};

export default {
	version,
	createElement,
	useState,
	useEffect,
	useTransition,
	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
	isValidElement
};
