import {
	FulfilledThenable,
	PendingThenable,
	RejectedThenable,
	Thenable
} from 'shared/ReactTypes';

export const SuspenseException = new Error(
	'这不是真实的错误，是 Suspense 工作的一部分，如果你捕获到这个错误，请将它继续抛出去'
);

let suspendedThenable: Thenable<any> | null = null;

export function getSuspendedThenable(): Thenable<any> {
	if (suspendedThenable === null) {
		throw new Error('应该存在 suspendedThenable，这是个 bug');
	}
	const thenable = suspendedThenable;
	suspendedThenable = null;
	return thenable;
}

function noop() {}

export function trackUsedThenable<T>(thenable: Thenable<T>) {
	switch (thenable.status) {
		case 'fulfilled':
			return thenable.value;
		case 'rejected':
			throw thenable.reason;
		default: {
			if (typeof thenable.status === 'string') {
				thenable.then(noop, noop);
			} else {
				// untracked

				// pending
				const pending = thenable as unknown as PendingThenable<T, void, any>;
				pending.status = 'pending';
				pending.then(
					(value) => {
						if (pending.status === 'pending') {
							const fulfilled = pending as unknown as FulfilledThenable<
								T,
								void,
								any
							>;
							fulfilled.status = 'fulfilled';
							fulfilled.value = value;
						}
					},
					(error) => {
						if (pending.status === 'pending') {
							const rejected = pending as unknown as RejectedThenable<
								T,
								void,
								any
							>;
							rejected.status = 'rejected';
							rejected.reason = error;
						}
					}
				);
			}
		}
	}

	suspendedThenable = thenable;

	throw SuspenseException;
}
