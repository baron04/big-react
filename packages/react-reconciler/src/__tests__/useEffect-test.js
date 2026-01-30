/* eslint-disable react/prop-types */
'use strict';

let React;
let ReactNoop;
let act;
let useEffect;

describe('useEffect', () => {
	beforeEach(() => {
		jest.resetModules();

		React = require('react');
		ReactNoop = require('react-noop-renderer');
		act = require('jest-react').act;
		useEffect = React.useEffect;
	});

	test('useEffect runs after render', async () => {
		let effectRan = false;

		function Component() {
			useEffect(() => {
				effectRan = true;
			});
			return <div>Hello</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		expect(root).toMatchRenderedOutput(<div>Hello</div>);
		expect(effectRan).toBe(true);
	});

	test('useEffect cleanup runs on unmount', async () => {
		let cleanupRan = false;

		function Component() {
			useEffect(() => {
				return () => {
					cleanupRan = true;
				};
			});
			return <div>Hello</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		expect(cleanupRan).toBe(false);

		await act(async () => {
			root.render(null);
		});

		expect(cleanupRan).toBe(true);
	});

	test('useEffect with dependencies only runs when deps change', async () => {
		let effectRunCount = 0;

		function Component({ value }) {
			useEffect(() => {
				effectRunCount++;
			}, [value]);
			return <div>{value}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component value={1} />);
		});

		expect(effectRunCount).toBe(1);

		await act(async () => {
			root.render(<Component value={1} />);
		});

		// 值没变化，effect 不应该再次运行
		expect(effectRunCount).toBe(1);

		await act(async () => {
			root.render(<Component value={2} />);
		});

		// 值变化了，effect 应该再次运行
		expect(effectRunCount).toBe(2);
	});

	test('useEffect cleanup runs before next effect', async () => {
		const logs = [];

		function Component({ value }) {
			useEffect(() => {
				logs.push(`Effect ${value}`);
				return () => {
					logs.push(`Cleanup ${value}`);
				};
			}, [value]);
			return <div>{value}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component value={1} />);
		});

		await act(async () => {
			root.render(<Component value={2} />);
		});

		// Cleanup 应该在新的 Effect 之前运行
		expect(logs).toEqual(['Effect 1', 'Cleanup 1', 'Effect 2']);
	});

	test('multiple useEffects run in order', async () => {
		const logs = [];

		function Component() {
			useEffect(() => {
				logs.push('Effect 1');
			});
			useEffect(() => {
				logs.push('Effect 2');
			});
			useEffect(() => {
				logs.push('Effect 3');
			});
			return <div>Hello</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<Component />);
		});

		expect(logs).toEqual(['Effect 1', 'Effect 2', 'Effect 3']);
	});
});
