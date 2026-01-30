import {
	createContainer,
	updateContainer
} from 'react-reconciler/src/fiberReconciler';
import { Container, Instance } from './hostConfig';
import { ReactElement } from 'shared/ReactTypes';
import { REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE } from 'shared/ReactSymbols';
import * as Scheduler from 'scheduler';

let idCounter = 0;

export function createRoot() {
	const container: Container = {
		rootID: idCounter++,
		children: []
	};

	// @ts-ignore
	const root = createContainer(container);

	function getChildren(parent: Container | Instance) {
		if (parent) {
			return parent.children;
		}
		return null;
	}

	function getChildrenAsJSX(root: Container) {
		const children = childToJSX(getChildren(root));
		if (Array.isArray(children)) {
			return {
				$$typeof: REACT_ELEMENT_TYPE,
				type: REACT_FRAGMENT_TYPE,
				key: null,
				ref: null,
				props: { children },
				__mark: 'KaSong'
			};
		}
		return children;
	}

	function toTestNode(node: any) {
		if (node === null || node === undefined) return node;
		// TextInstance
		if (typeof node.text === 'string') {
			return node.text;
		}
		// Instance
		if (typeof node.type === 'string' && Array.isArray(node.children)) {
			return {
				type: node.type,
				props: node.props,
				children: node.children.map(toTestNode)
			};
		}
		return node;
	}

	function findAllByType(type: string) {
		const results: any[] = [];
		function visit(node: any) {
			if (node === null || node === undefined) return;
			if (typeof node === 'string') return;
			if (node.type === type) {
				results.push(node);
			}
			if (Array.isArray(node.children)) {
				node.children.forEach(visit);
			}
		}
		const children = getChildren(container) || [];
		children.map(toTestNode).forEach(visit);
		return results;
	}

	function findByType(type: string) {
		const all = findAllByType(type);
		if (all.length === 0) {
			throw new Error(`No instances found with type: ${type}`);
		}
		return all[0];
	}

	function childToJSX(child: any) {
		if (typeof child === 'string' || typeof child === 'number') {
			return child;
		}
		if (Array.isArray(child)) {
			if (child.length === 0) {
				return null;
			}
			if (child.length === 1) {
				return childToJSX(child[0]);
			}
			const children: any[] = child.map(childToJSX);

			if (
				children.every(
					(child) => typeof child === 'string' || typeof child === 'number'
				)
			) {
				return children.join('');
			}
			// 数组包含了TextInstance和Instance
			return children;
		}

		// Instance
		if (Array.isArray(child.children)) {
			const instance: Instance = child;
			const children = childToJSX(child.children);
			const props = instance.props;
			if (children !== null) {
				props.children = children;
			}
			return {
				$$typeof: REACT_ELEMENT_TYPE,
				type: instance.type,
				key: null,
				ref: null,
				props,
				__mark: 'KaSong'
			};
		}

		// TextInstance
		return child.text;
	}

	return {
		_Scheduler: Scheduler,
		render(element: ReactElement) {
			return updateContainer(element, root);
		},
		getChildren() {
			return getChildren(container);
		},
		getChildrenAsJSX() {
			return getChildrenAsJSX(container);
		},
		findByType,
		findAllByType
	};
}
