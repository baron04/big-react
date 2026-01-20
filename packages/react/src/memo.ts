import type { FiberNode } from 'react-reconciler/src/fiber';
import { REACT_MEMO_TYPE } from 'shared/ReactSymbols';
import { Props } from 'shared/ReactTypes';

export function memo<P = Props>(
	type: FiberNode['type'],
	compare?: (oldProps: P, newProps: P) => boolean
) {
	const fiberType = {
		$$typeof: REACT_MEMO_TYPE,
		type,
		compare: compare === undefined ? null : compare
	};
	return fiberType;
}
