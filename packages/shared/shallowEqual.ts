export function shallowEqual(a: any, b: any) {
	if (Object.is(a, b)) {
		return true;
	}

	// 两个中有一个不是对象
	if (
		typeof a !== 'object' ||
		a === null ||
		typeof b !== 'object' ||
		b === null
	) {
		return false;
	}

	const keysA = Object.keys(a);
	const keysB = Object.keys(b);

	if (keysA.length !== keysB.length) {
		return false;
	}

	for (let i = 0; i < keysA.length; i++) {
		const key = keysA[i];

		// b 没有 key，或者 key 不相等
		if (
			!Object.prototype.hasOwnProperty.call(b, key) ||
			!Object.is(a[key], b[key])
		) {
			return false;
		}
	}

	return true;
}
