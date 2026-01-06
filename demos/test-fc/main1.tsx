import * as React from 'react';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

// import ReactDOM from 'react-dom';
// console.log(ReactDOM);

// console.log(import.meta.hot);

function Child() {
	return 'child';
}

function App() {
	const [num, setNum] = useState(100);
	window.setNum = setNum;

	return <div>{num == 3 ? <Child /> : <div>{num}</div>}</div>;
}

createRoot(document.getElementById('root')!).render(<App />);
