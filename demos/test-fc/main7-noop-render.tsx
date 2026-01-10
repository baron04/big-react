import * as React from 'react';
import ReactNoopRenderer from 'react-noop-renderer';
// import { createRoot } from 'react-noop-renderer';

function Child() {
	return 'Child';
}

function App() {
	return (
		<>
			<div>hello world</div>
			<Child />
		</>
	);
}

const root = ReactNoopRenderer.createRoot();
root.render(<App />);
window.root = root;
// root.getChildren()
