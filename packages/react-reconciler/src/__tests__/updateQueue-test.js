/**
 * 测试 processUpdateQueue 中状态计算的正确性
 *
 * 关键测试点：验证多个连续的 update 是否按顺序链式处理
 */

const { processUpdateQueue, createUpdate } = require('../updateQueue');
const { SyncLane } = require('../fiberLanes');

describe('processUpdateQueue - 链式更新测试', () => {
	test('多个函数式更新应该链式处理', () => {
		const baseState = 0;

		// 创建 3 个连续的 update: +1, +2, +3
		const u0 = createUpdate((n) => n + 1, SyncLane);
		const u1 = createUpdate((n) => n + 2, SyncLane);
		const u2 = createUpdate((n) => n + 3, SyncLane);

		// 构建循环链表
		u0.next = u1;
		u1.next = u2;
		u2.next = u0;

		const pending = u2; // pending 指向最后一个

		const result = processUpdateQueue(baseState, pending, SyncLane);

		// 正确结果: 0+1=1, 1+2=3, 3+3=6
		expect(result.memoizedState).toBe(6);
	});

	test('混合函数式和直接值更新', () => {
		const baseState = 0;

		// u0: +1, u1: 直接设置为 5, u2: +10
		const u0 = createUpdate((n) => n + 1, SyncLane);
		const u1 = createUpdate(5, SyncLane);
		const u2 = createUpdate((n) => n + 10, SyncLane);

		u0.next = u1;
		u1.next = u2;
		u2.next = u0;

		const pending = u2;
		const result = processUpdateQueue(baseState, pending, SyncLane);

		// 正确结果: 0+1=1, 然后设置为 5, 然后 5+10=15
		expect(result.memoizedState).toBe(15);
	});

	test('复杂场景：乘法和加法混合', () => {
		const baseState = 0;

		// u0: *2, u1: 设置为 5, u2: +1, u3: *2
		const u0 = createUpdate((n) => n * 2, SyncLane);
		const u1 = createUpdate(5, SyncLane);
		const u2 = createUpdate((n) => n + 1, SyncLane);
		const u3 = createUpdate((n) => n * 2, SyncLane);

		u0.next = u1;
		u1.next = u2;
		u2.next = u3;
		u3.next = u0;

		const pending = u3;
		const result = processUpdateQueue(baseState, pending, SyncLane);

		// 正确结果: 0*2=0, 然后设置为 5, 然后 5+1=6, 然后 6*2=12
		expect(result.memoizedState).toBe(12);
	});
});
