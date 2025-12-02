import * as React from 'react';
import { createRoot } from 'react-noop-renderer';
import './schedule';

function App() {
	return (
		<>
			<Child />
			<div>hello world</div>
		</>
	);
}

function Child() {
	return 'Child';
}

const root = createRoot();
root.render(<App />);
window.root = root;
