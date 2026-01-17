import { REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE } from 'shared/ReactSymbols';
import type { Key, Props, ReactElement, Ref, Type } from 'shared/ReactTypes';

const ReactElement = function (
	type: Type,
	key: Key | null,
	ref: Ref,
	props: Props
): ReactElement {
	const element = {
		$$typeof: REACT_ELEMENT_TYPE,
		type,
		key,
		ref,
		props,
		__mark: 'KaSong'
	};
	return element;
};

// 在 传统转换（Classic Runtime）中，React.createElement 的第三个参数及其后的参数都是 子元素（children）
// 在 自动转换（Automatic Runtime） 中，_jsx 函数只有 两个参数，所有的子元素都通过第二个参数的 children 属性来传递。
export const jsx = function (type: Type, config: any, maybeKey: any) {
	let key: Key | null = null;
	const props: Props = {};
	let ref: Ref = null;

	if (maybeKey !== undefined) {
		key = '' + maybeKey;
	}

	for (const prop in config) {
		const val = config[prop];

		if (prop === 'key') {
			if (val !== undefined) {
				key = '' + val;
			}
			continue;
		}

		if (prop === 'ref') {
			if (val !== undefined) {
				ref = val;
			}
			continue;
		}

		if (Object.prototype.hasOwnProperty.call(config, prop)) {
			props[prop] = val;
		}
	}

	return ReactElement(type, key, ref, props);
};

export function isValidElement(object: any) {
	return (
		typeof object === 'object' &&
		object !== null &&
		object.$$typeof === REACT_ELEMENT_TYPE
	);
}

export const jsxDEV = jsx;
export const jsxs = jsx;

export const Fragment = REACT_FRAGMENT_TYPE;
