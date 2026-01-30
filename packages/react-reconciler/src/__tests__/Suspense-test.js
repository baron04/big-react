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

		React = require('react');
		ReactNoop = require('react-noop-renderer');
		act = require('jest-react').act;
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

	test('nested Suspense uses nearest fallback', async () => {
		const cache = new Map();
		let resolvePromise;

		function fetchData(id) {
			if (!cache.has(id)) {
				const p = new Promise((resolve) => {
					resolvePromise = resolve;
				});
				cache.set(id, p);
			}
			return cache.get(id);
		}

		function Inner() {
			use(fetchData('inner'));
			return <div>Inner</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<Suspense fallback="Outer">
					<div>
						<Suspense fallback="InnerFallback">
							<Inner />
						</Suspense>
					</div>
				</Suspense>
			);
		});

		expect(root).toMatchRenderedOutput(<div>InnerFallback</div>);

		await act(async () => {
			resolvePromise();
		});
		expect(root).toMatchRenderedOutput(
			<div>
				<div>Inner</div>
			</div>
		);
	});

	test('switching to new thenable keeps previous primary while showing fallback', async () => {
		const cache = new Map();
		const resolvers = new Map();

		function fetchData(id) {
			if (!cache.has(id)) {
				const p = new Promise((resolve) => {
					resolvers.set(id, resolve);
				});
				cache.set(id, p);
			}
			return cache.get(id);
		}

		function Child({ id }) {
			use(fetchData(id));
			return <div>Child:{id}</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<Suspense fallback="Loading">
					<Child id={1} />
				</Suspense>
			);
		});
		expect(root).toMatchRenderedOutput('Loading');

		await act(async () => {
			resolvers.get(1)();
		});
		expect(root).toMatchRenderedOutput(<div>Child:1</div>);

		await act(async () => {
			root.render(
				<Suspense fallback="Loading">
					<Child id={2} />
				</Suspense>
			);
		});
		// In this implementation, switching to a new thenable keeps the previous
		// primary content visible while also showing the fallback.
		expect(root).toMatchRenderedOutput(
			<>
				<div>Child:1</div>
				{'Loading'}
			</>
		);

		await act(async () => {
			resolvers.get(2)();
		});
		expect(root).toMatchRenderedOutput(<div>Child:2</div>);
	});
});
