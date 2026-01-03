import * as React from 'react';

declare global {
	namespace JSX {
		type Element = React.ReactElement;
		interface ElementClass {
			render(): React.ReactNode;
		}
		interface ElementAttributesProperty {
			props: object;
		}
		interface ElementChildrenAttribute {
			children: object;
		}
		type IntrinsicAttributes = object;
		type IntrinsicClassAttributes<T> = object;

		interface IntrinsicElements {
			div: any;
			span: any;
			ul: any;
			li: any;
			// 添加其他需要的 HTML 元素
			[elemName: string]: any;
		}
	}
}

export {};
