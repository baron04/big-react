/* eslint-disable react/prop-types */
'use strict';

let React;
let ReactNoop;
let act;
let Suspense;
let use;

describe('Suspense test', () => {
	beforeEach(() => {
		jest.resetModules();
		jest.useFakeTimers();

		React = require('react');
		act = require('jest-react').act;
		ReactNoop = require('react-noop-renderer');
		Suspense = React.Suspense;
		use = React.use;
	});

	test('Suspense works with resolved data', async () => {
		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<Suspense fallback="Loading">
					<div>Hello</div>
				</Suspense>
			);
		});
		expect(root).toMatchRenderedOutput(<div>Hello</div>);
	});

	test('Suspense render children and fallback test', async () => {
		const cache = new Map();
		let resolvePromise;

		function fetchData(id) {
			if (!cache.has(id)) {
				const p = new Promise((resolve) => {
					resolvePromise = resolve;
				});
				cache.set(id, p);
				return p;
			}
			return cache.get(id);
		}

		function Child({ id }) {
			use(fetchData(id));
			return <div>Child</div>;
		}

		const root = ReactNoop.createRoot();

		// First render - should show fallback
		await act(async () => {
			root.render(
				<Suspense fallback="Loading">
					<Child id={1} />
				</Suspense>
			);
		});

		expect(root).toMatchRenderedOutput('Loading');

		// Resolve the promise
		await act(async () => {
			resolvePromise();
		});

		// Promise resolve 之后，应该渲染 primary
		expect(root).toMatchRenderedOutput(<div>Child</div>);
	});
});
