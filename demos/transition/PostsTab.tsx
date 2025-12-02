const PostsTab = function PostsTab() {
	const items = [];
	for (let i = 0; i < 500; i++) {
		items.push(<SlowPost key={i} index={i} />);
	}
	return <ul className="items">{items}</ul>;
};

function SlowPost({ index }: any) {
	const startTime = performance.now();
	while (performance.now() - startTime < 2) {
		// @ts-ignore
	}

	return <li className="item">博文 #{index + 1}</li>;
}

export default PostsTab;
