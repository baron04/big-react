// 不安装 @types/react 时的 JSX 类型声明
declare namespace JSX {
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
		input: any;
		[elemName: string]: any;
	}
}
