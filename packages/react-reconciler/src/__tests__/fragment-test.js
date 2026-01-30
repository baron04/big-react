'use strict';

// JSX in this file is compiled to `React.createElement` (classic runtime), so we
// need `React` in scope even if it looks unused to ESLint.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let React;
let ReactNoop;
let act;

describe('Fragment', () => {
	beforeEach(() => {
		jest.resetModules();

		React = require('react');
		ReactNoop = require('react-noop-renderer');
		act = require('jest-react').act;
	});

	test('Fragment renders children without wrapper', async () => {
		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<>
					<div>1</div>
					<div>2</div>
				</>
			);
		});

		expect(root).toMatchRenderedOutput(
			<>
				<div>1</div>
				<div>2</div>
			</>
		);
	});

	test('Fragment with key works correctly', async () => {
		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<>
					<div key="a">1</div>
					<div key="b">2</div>
				</>
			);
		});

		await act(async () => {
			root.render(
				<>
					<div key="b">2</div>
					<div key="a">1</div>
				</>
			);
		});

		expect(root).toMatchRenderedOutput(
			<>
				<div>2</div>
				<div>1</div>
			</>
		);
	});

	test('nested Fragments work correctly', async () => {
		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<>
					<>
						<div>1</div>
					</>
					<>
						<div>2</div>
					</>
				</>
			);
		});

		expect(root).toMatchRenderedOutput(
			<>
				<div>1</div>
				<div>2</div>
			</>
		);
	});
});
