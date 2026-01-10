import * as React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
	const [num, setNum] = React.useState(1);

	return (
		<div>
			{num}
			<button
				onClick={() => {
					setNum((num) => num + 1);
					setNum((num) => num + 1);
					setNum((num) => num + 1);
				}}
			>
				add
			</button>
		</div>
	);
}

createRoot(document.getElementById('root')!).render(<App />);
