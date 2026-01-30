'use strict';

let React;
let ReactNoop;
let act;
let useEffect;

describe('WorkLoop', () => {
	beforeEach(() => {
		jest.resetModules();

		React = require('react');
		act = require('jest-react').act;
		ReactNoop = require('react-noop-renderer');
		useEffect = React.useEffect;
	});

	test('whole tree renders before any commit-phase work runs', async () => {
		// render 阶段整体走完才进 commit，则两个 render 一定都排在两个 effect 之前
		const logs = [];

		function A() {
			logs.push('render A');
			useEffect(() => {
				logs.push('effect A');
			});
			return <div>A</div>;
		}

		function B() {
			logs.push('render B');
			useEffect(() => {
				logs.push('effect B');
			});
			return <div>B</div>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<div>
					<A />
					<B />
				</div>
			);
		});

		expect(logs).toEqual(['render A', 'render B', 'effect A', 'effect B']);
		expect(root).toMatchRenderedOutput(
			<div>
				<div>A</div>
				<div>B</div>
			</div>
		);
	});
});
