import * as React from 'react';
import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
	const [num, setNum] = useState(100);
	return (
		<ul onClick={() => setNum(50)}>
			{new Array(num).fill(0).map((_, i) => (
				<Child key={i}>{i}</Child>
			))}
		</ul>
	);
}

function Child({ children }: any) {
	const now = performance.now();

	while (performance.now() - now < 4) {
		// @ts-ignore
	}
	return <li>{children}</li>;
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);
window.root = root;
