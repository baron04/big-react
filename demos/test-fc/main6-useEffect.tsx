import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

function Child() {
	useEffect(() => {
		console.log('Child mount');
		return () => console.log('Child unmount');
	}, []);
	return 'I am child';
}

function App() {
	const [num, setNum] = useState(0);

	useEffect(() => {
		console.log('App mount');
	}, []);

	useEffect(() => {
		console.log('num change', num);
		return () => console.log('num change destroy', num);
	}, [num]);

	return (
		<div>
			<button
				onClick={() => {
					setNum((num) => num + 1);
				}}
			>
				add
			</button>
			{num === 0 ? <Child /> : 'noop'}
		</div>
	);
}

createRoot(document.getElementById('root')!).render(<App />);
