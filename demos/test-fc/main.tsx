import * as React from 'react';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
	const [num, setNum] = useState(1);

	return (
		<div
			onClick={() => {
				setNum(num + 1);
			}}
		>
			{num}
		</div>
	);
}

createRoot(document.getElementById('root')!).render(<App />);
