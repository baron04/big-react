import JestReact from 'jest-react';
import SchedulerMatchers from './schedulerTestMatchers.js';

function normalizeJSX(node, inChildren = false) {
	if (node === null || node === undefined) {
		return node;
	}

	// In rendered output, numeric children are equivalent to text.
	// Our noop renderer stringifies numeric text nodes (0 -> "0"), while JSX
	// literals may keep them as numbers. Normalize only in children context.
	if (typeof node === 'number') {
		return inChildren ? String(node) : node;
	}
	if (typeof node === 'string') {
		return node;
	}
	if (Array.isArray(node)) {
		return node.map((c) => normalizeJSX(c, inChildren));
	}
	// React elements are plain objects with `$$typeof`.
	if (
		typeof node === 'object' &&
		node.$$typeof !== null &&
		node.$$typeof !== undefined
	) {
		const { $$typeof, type, key, ref, props } = node;
		const normalizedProps = {};
		if (props !== null && props !== undefined && typeof props === 'object') {
			for (const propName in props) {
				if (!Object.prototype.hasOwnProperty.call(props, propName)) continue;
				const value = props[propName];
				// Event handlers/functions are not part of rendered output shape.
				if (typeof value === 'function') continue;
				normalizedProps[propName] = normalizeJSX(
					value,
					// Treat children as rendered text context.
					propName === 'children'
				);
			}
		}
		// Strip dev-only/internal fields like _owner/_store/_self/_source.
		return { $$typeof, type, key, ref, props: normalizedProps };
	}
	// For other objects (e.g. style), best-effort deep normalize.
	if (typeof node === 'object') {
		const out = {};
		for (const k in node) {
			if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
			out[k] = normalizeJSX(node[k], false);
		}
		return out;
	}
	return node;
}

function captureAssertion(fn) {
	// Trick to use a Jest matcher inside another Jest matcher. `fn` contains an
	// assertion; if it throws, we capture the error and return it, so the stack
	// trace presented to the user points to the original assertion in the
	// test file.
	try {
		fn();
	} catch (error) {
		return {
			pass: false,
			message: () => error.message
		};
	}
	return { pass: true };
}

function assertYieldsWereCleared(Scheduler) {
	const actualYields = Scheduler.unstable_clearYields();
	if (actualYields.length !== 0) {
		throw new Error(
			'Log of yielded values is not empty. ' +
				'Call expect(Scheduler).toHaveYielded(...) first.'
		);
	}
}

function toMatchRenderedOutput(ReactNoop, expectedJSX) {
	if (typeof ReactNoop.getChildrenAsJSX === 'function') {
		const Scheduler = ReactNoop._Scheduler;
		assertYieldsWereCleared(Scheduler);
		return captureAssertion(() => {
			expect(normalizeJSX(ReactNoop.getChildrenAsJSX())).toEqual(
				normalizeJSX(expectedJSX)
			);
		});
	}
	return JestReact.unstable_toMatchRenderedOutput(ReactNoop, expectedJSX);
}

export default {
	...SchedulerMatchers,
	toMatchRenderedOutput
};
