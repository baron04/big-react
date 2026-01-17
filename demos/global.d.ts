declare global {
	namespace JSX {
		type Element = any;
		interface ElementClass {
			render(): any;
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
			p: any;
			a: any;
			button: any;
			// 添加其他需要的 HTML 元素
			[elemName: string]: any;
		}
	}
}

export {};
