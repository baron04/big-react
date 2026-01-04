import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbols';
import currentDispatcher, {
	Dispatcher,
	resolveDispatcher
} from './src/currentDispatcher';
import { createElement } from './src/jsx';

const version = '0.0.0';

const useState: Dispatcher['useState'] = (initialState) => {
	const dispatcher = resolveDispatcher();
	return dispatcher.useState(initialState);
};

// 内部数据共享层
const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher
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
	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
	isValidElement
};

export default {
	version,
	createElement,
	useState,
	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
	isValidElement
};
