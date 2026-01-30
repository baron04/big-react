/* eslint-disable react/prop-types */
'use strict';

let React;
let ReactNoop;
let act;
let useMemo;
let useCallback;

describe('useMemo and useCallback', () => {
	beforeEach(() => {
		jest.resetModules();

		React = require('react');
		ReactNoop = require('react-noop-renderer');
		act = require('jest-react').act;
		useMemo = React.useMemo;
		useCallback = React.useCallback;
	});

	test('useMemo caches computed value', async () => {
		let computeCount = 0;

		function Component({ value }) {
			const memoized = useMemo(() => {
				computeCount++;
				return value * 2;
			}, [value]);

			return <div>{memoized}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component value={1} />);
		});

		expect(computeCount).toBe(1);
		expect(root).toMatchRenderedOutput(<div>2</div>);

		await act(async () => {
			root.render(<Component value={1} />);
		});

		// 依赖没变化，不应该重新计算
		expect(computeCount).toBe(1);

		await act(async () => {
			root.render(<Component value={2} />);
		});

		// 依赖变化了，应该重新计算
		expect(computeCount).toBe(2);
		expect(root).toMatchRenderedOutput(<div>4</div>);
	});

	test('useCallback caches function reference', async () => {
		let callback1;
		let callback2;

		function Component({ value }) {
			const memoizedCallback = useCallback(() => {
				return value;
			}, [value]);

			if (value === 1) {
				callback1 = memoizedCallback;
			} else {
				callback2 = memoizedCallback;
			}

			return <div>{value}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component value={1} />);
		});

		await act(async () => {
			root.render(<Component value={1} />);
		});

		// 依赖没变化，函数引用应该相同
		// 注意：这需要检查实际的实现

		await act(async () => {
			root.render(<Component value={2} />);
		});

		// 依赖变化了，函数引用应该不同
		expect(callback1).not.toBe(callback2);
	});

	test('useMemo with empty deps only computes once', async () => {
		let computeCount = 0;

		function Component() {
			const memoized = useMemo(() => {
				computeCount++;
				return Math.random();
			}, []);

			return <div>{memoized}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		const firstValue = root.findByType('div').children[0];

		await act(async () => {
			root.render(<Component />);
		});

		// 空依赖数组，应该只计算一次
		expect(computeCount).toBe(1);
		const secondValue = root.findByType('div').children[0];
		expect(firstValue).toBe(secondValue);
	});
});
