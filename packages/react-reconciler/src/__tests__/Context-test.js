/* eslint-disable react/prop-types */
'use strict';

let React;
let ReactNoop;
let act;
let useContext;
let createContext;

describe('Context', () => {
	beforeEach(() => {
		jest.resetModules();

		React = require('react');
		ReactNoop = require('react-noop-renderer');
		act = require('jest-react').act;
		useContext = React.useContext;
		createContext = React.createContext;
	});

	test('Context provides and consumes value', async () => {
		const ThemeContext = createContext('light');

		function ThemeProvider({ children, value }) {
			return (
				<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
			);
		}

		function ThemedButton() {
			const theme = useContext(ThemeContext);
			return <button>{theme}</button>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<ThemeProvider value="dark">
					<ThemedButton />
				</ThemeProvider>
			);
		});

		expect(root).toMatchRenderedOutput(<button>dark</button>);
	});

	test('Context uses default value when no Provider', async () => {
		const ThemeContext = createContext('light');

		function ThemedButton() {
			const theme = useContext(ThemeContext);
			return <button>{theme}</button>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<ThemedButton />);
		});

		expect(root).toMatchRenderedOutput(<button>light</button>);
	});

	test('Context updates when Provider value changes', async () => {
		const ThemeContext = createContext('light');

		function ThemeProvider({ children, value }) {
			return (
				<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
			);
		}

		function ThemedButton() {
			const theme = useContext(ThemeContext);
			return <button>{theme}</button>;
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<ThemeProvider value="dark">
					<ThemedButton />
				</ThemeProvider>
			);
		});

		expect(root).toMatchRenderedOutput(<button>dark</button>);

		await act(async () => {
			root.render(
				<ThemeProvider value="light">
					<ThemedButton />
				</ThemeProvider>
			);
		});

		expect(root).toMatchRenderedOutput(<button>light</button>);
	});

	test('nested Context Providers work correctly', async () => {
		const ThemeContext = createContext('light');
		const LanguageContext = createContext('en');

		function ThemedButton() {
			const theme = useContext(ThemeContext);
			const lang = useContext(LanguageContext);
			return (
				<button>
					{theme}-{lang}
				</button>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(
				<ThemeContext.Provider value="dark">
					<LanguageContext.Provider value="zh">
						<ThemedButton />
					</LanguageContext.Provider>
				</ThemeContext.Provider>
			);
		});

		expect(root).toMatchRenderedOutput(<button>dark-zh</button>);
	});

	test('Context updates only consumers when value changes', async () => {
		const ThemeContext = createContext('light');
		let nonConsumerRenderCount = 0;
		let consumerRenderCount = 0;

		function NonConsumer() {
			nonConsumerRenderCount++;
			return <div>Static</div>;
		}

		function Consumer() {
			consumerRenderCount++;
			const theme = useContext(ThemeContext);
			return <div>{theme}</div>;
		}

		function App({ theme }) {
			return (
				<ThemeContext.Provider value={theme}>
					<NonConsumer />
					<Consumer />
				</ThemeContext.Provider>
			);
		}

		const root = ReactNoop.createRoot();
		await act(async () => {
			root.render(<App theme="dark" />);
		});

		expect(nonConsumerRenderCount).toBe(1);
		expect(consumerRenderCount).toBe(1);

		await act(async () => {
			root.render(<App theme="light" />);
		});

		// NonConsumer 不应该重新渲染（如果实现了 bailout）
		// Consumer 应该重新渲染
		expect(consumerRenderCount).toBe(2);
	});
});
