import {
	createElement,
	Fragment,
	isValidElement,
	Suspense
} from './src/jsx';
import { createContext } from './src/context';
import {
	useState,
	useEffect,
	useTransition,
	useRef,
	useContext,
	use
} from './src/hooks';

import currentDispatcher from './src/currentDispatcher';
import currentBatchConfig from './src/currentBatchConfig';

// 内部数据共享层
const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
	currentDispatcher,
	currentBatchConfig
};

const version = '1.0.0';

export {
	version,
	createElement,
	useState,
	useEffect,
	useTransition,
	useRef,
	useContext,
	createContext,
	use,
	isValidElement,
	Fragment,
	Suspense,
	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
};

const React = {
	version,
	createElement,
	useState,
	useEffect,
	useTransition,
	useRef,
	useContext,
	createContext,
	use,
	isValidElement,
	Fragment,
	Suspense,
	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
};

export default React;
