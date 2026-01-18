export const FunctionComponent = 0;
export const HostRoot = 3; // React 应用根节点
export const HostComponent = 5; // 原生 DOM 节点（div、span等）
export const HostText = 6; // 文本节点
export const Fragment = 7;
export const ContextProvider = 8;

export const SuspenseComponent = 13;
export const OffscreenComponent = 14;

export type WorkTag =
	| typeof FunctionComponent
	| typeof HostRoot
	| typeof HostComponent
	| typeof HostText
	| typeof Fragment
	| typeof ContextProvider
	| typeof SuspenseComponent
	| typeof OffscreenComponent;

// HostRoot 是：
// React 应用的 最顶层 Fiber 节点
// 连接 React 虚拟 DOM 和真实 DOM 容器的桥梁
// 管理整个应用的状态和更新的起点
