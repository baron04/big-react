# React 源码面试题库

> 本文档以企业真实面试为参照组织答案，分为两档：核心档按「核心结论、详细讲解、常见误区、延伸追问」四段组织，适合直接背诵；普通档保持连贯叙述。不讲具体代码实现，侧重原理机制和设计思想，适合面试现场直接使用。按官方 React 实现组织答案，而不是 big-react。

## 高频地图

| 模块                | 高频程度 | 必须掌握的问题                                                    |
| ------------------- | -------- | ----------------------------------------------------------------- |
| Fiber               | 极高     | 为什么引入 Fiber、双缓存、可中断、flags、lanes                    |
| Diff/Reconciliation | 极高     | key、同层比较、移动判断、删除、复用、复杂度                       |
| Hooks               | 极高     | 链表结构、调用顺序、update queue、闭包、effect 时机、死循环与竞态 |
| Lane/Scheduler      | 高       | 优先级、时间切片、打断、shouldYield、Transition                   |
| Commit              | 高       | mutation/layout/passive 顺序、为什么 commit 不可中断              |
| Suspense/Concurrent | 中高     | throw thenable、fallback、ping 重试、并发渲染、use()              |
| 事件系统            | 中高     | 事件委托、合成事件、捕获冒泡、事件优先级                          |
| 版本特性            | 中高     | React 18 并发/自动批处理、19 Actions/use()、StrictMode            |
| SSR/Hydration       | 中       | SSR 价值、hydrate、mismatch、选择性 hydration                     |

---

## 一、整体架构

### 1. React 从调用 setState 到页面变化，内部执行流程是怎样的？

**核心结论**：从调用 setState 到页面变化，依次经历触发与 Update 入队、优先级冒泡到 root、调度、render、commit、passive effect 执行六个阶段。其中只有 render 可以中断和丢弃，commit 必须同步原子完成，passive effect 是提交后的异步收尾。

**详细讲解**：

1. **触发与入队**：setState 不会直接修改 DOM，而是创建一个 Update 对象——携带更新的动作（新值或函数式更新）和优先级 Lane——插入组件对应的环形更新队列。然后 React 沿父链把 Lane 冒泡到沿途每个祖先的 childLanes，最终汇总到 root 的 pendingLanes。
2. **调度**：由 root 统一负责，按当前最高优先级 Lane 决定策略。同步优先级走微任务尽快执行，其他优先级交给 Scheduler，以宏任务方式按优先级和时间片调度。这一层让紧急更新（用户输入）和非紧急更新（transition）可以被区分、插队和打断。
3. **render（可中断）**：深度优先遍历构建 workInProgress 树。beginWork 向下递——执行函数组件、处理更新队列、Diff children 生成子 Fiber；completeWork 向上归——创建 DOM 实例、收集子节点、冒泡副作用标记和优先级。并发模式下每个 Fiber 边界检查时间片，用尽就保留进度指针退出，等下一个时间片继续；更高优先级到来时甚至可以丢弃整棵 WIP 树重来，因为这一阶段不修改任何外部世界。
4. **commit（不可中断）**：mutation 子阶段按 flags 执行真正的 DOM 插入、删除和更新；随后切换 current 指针，让新的 Fiber 树成为当前屏幕状态；layout 子阶段同步绑定 ref、执行 layout effect。
5. **passive effect**：useEffect 回调通过 Scheduler 异步调度执行，不阻塞浏览器绘制。

**常见误区**：认为调用 setState 的瞬间就发生了 DOM 更新——实际上中间隔着入队、冒泡、调度和整个 render，DOM 只在 commit 的 mutation 子阶段才被修改。

**延伸追问**：面试官常追问「哪些阶段可以被中断」。要点：只有 render 可中断；调度层面可能因更高优先级到来而取消重排；commit 及其同步子阶段不可中断，passive effect 只是延后执行而非可断。

### 2. ReactElement 和 Fiber 的区别是什么？

ReactElement 是 JSX 编译后的轻量数据对象，它只包含 type、key、ref、props 这几个字段，本质上是一份"用户想渲染什么"的静态描述。它没有父子关系指针，没有状态，没有优先级，也没有副作用信息，本身不参与任何运行时调度。

Fiber 则是 React 运行时的核心工作单元。它在 ReactElement 的基础上扩展了大量运行时信息：通过 child、sibling、return 三个指针把组件树组织成链表结构，让 React 不依赖 JS 调用栈就能控制深度优先遍历；通过 alternate 指针关联另一棵 Fiber 树实现双缓存；通过 memoizedState 和 updateQueue 保存组件状态和更新队列；通过 flags 和 subtreeFlags 记录副作用；通过 lanes 和 childLanes 表达优先级。两者的生命周期也不同：ReactElement 每次 render 都会重新创建，是可以丢弃的描述数据；Fiber 跨 render 持久存在，承载状态与进度。可以说 ReactElement 是输入数据，Fiber 是 React 为了调度、Diff、中断恢复和提交而建立的执行结构。

追问通常延伸到 Fiber 上的 pendingProps 和 memoizedProps——前者是本次 render 待处理的新 props，后者是上次 render 固化下来的旧 props，beginWork 通过引用比较两者，配合 type 与优先级判断能否跳过本次执行。

### 3. React 为什么要分成 reconciler 和 renderer？

reconciler 负责平台无关的 UI 差异计算，包括 Fiber 树构建、Diff 算法、优先级调度、Hooks 管理和副作用标记。renderer 负责把计算出的变化应用到具体宿主环境——DOM、Native、测试环境等。reconciler 不直接认识 DOM，它只调用注入进来的宿主操作接口（创建节点、插入节点、更新属性等），依赖方向永远单向。这种分层让 React 的核心更新算法可以在不同平台完全复用，每个平台只需实现这套接口。

这也是为什么 React 不只能渲染 DOM。React DOM、React Native、测试用的 noop renderer，本质上共用同一套 reconciler，只是 commit 阶段调用的宿主操作不同。如果要新增一个渲染目标，只需实现这套宿主接口，无需改动核心的调度和 Diff 逻辑。

### 4. 为什么 React 需要 Fiber 架构？

**核心结论**：React 15 的 Stack Reconciler 用递归同步遍历组件树，树一大就长时间占用主线程，页面无法响应输入和动画；Fiber 架构用链表化的工作单元、时间切片和优先级调度，把渲染改造成可中断、可恢复的计算，这是 React 18 全部并发能力的底层基础。

**详细讲解**：

- **问题背景**：递归遍历中 JS 调用栈与组件树遍历一一对应，一旦进入就无法中途交还控制权。组件树过大时，整段计算长时间占住主线程，浏览器无法处理输入和绘制，造成掉帧卡顿。
- **链表替代调用栈**：每个 Fiber 通过 child、sibling、return 三个指针连接，React 自己控制遍历的递进和回溯。遍历状态保存在 Fiber 节点上而不是调用栈帧上，因此可以在任意 Fiber 边界暂停，之后从暂停处继续。
- **时间切片**：并发 work loop 在每个 Fiber 边界检查 shouldYield，时间片用尽就退出循环、把主线程还给浏览器，下一个时间片接着处理。
- **优先级调度**：Lane 模型为每个更新分配优先级，高优先级更新可以打断低优先级 render，先响应用户。
- **render 与 commit 分离**：可中断的纯计算和不可中断的提交分开，配合双缓存机制保证未完成的计算不影响屏幕。

这些设计共同支撑了 useTransition、Suspense 等 React 18 并发特性。

**常见误区**：把 Fiber 理解成「一种新数据结构」或「为了 Hooks 才引入」——数据结构只是手段，核心动机是把同步递归渲染改造成可中断、可恢复、可按优先级调度的工作单元。

**延伸追问**：可能追问「为什么不用生成器实现可中断」。要点：生成器只能暂停函数自身，无法整体丢弃一次半成品计算；Fiber 把进度存在节点上，配合双缓存才能做到丢弃重做。

### 5. 什么是双缓存 Fiber 树？

**核心结论**：React 同时维护两棵 Fiber 树——current 对应当前屏幕已提交的 UI，workInProgress 是正在计算的下一版 UI。render 全部发生在 workInProgress 上，commit 时一次指针赋值完成两棵树的交换。

**详细讲解**：

- **结构**：每对对应的 Fiber 节点通过 alternate 指针互相引用，可以随时从一棵找到另一棵。
- **构建与复用**：首次渲染会创建全新的 WIP Fiber 并建立 alternate 关联；更新时则复用已有的 WIP 节点，重置副作用标记、从 current 复制状态数据，避免重建整棵树的内存开销。
- **交换时机**：commit 的 mutation 一结束，workInProgress 就成为新的 current，切换本身只是一行指针赋值。
- **核心价值**：render 在内存中计算、完全不触碰屏幕，因此可以安全地中断和丢弃。更高优先级更新到来时，React 可以抛弃整棵 WIP 树、基于 current 重新开始，用户永远看不到半棵未完成的树。

**常见误区**：认为双缓存意味着「同时渲染两份 UI」或切换需要复制整棵树——交换只是指针赋值，真正的代价是常驻两份 Fiber 结构的内存，属于用空间换正确性与可中断性。

**延伸追问**：常被追问「一棵树原地修改行不行」。要点：单树原地改会让中断后没有干净的回退基准，无法丢弃重做，用户可能看到中间状态；双缓存让 current 永远代表一份一致快照。

### 6. Fiber 上的 return、child、sibling 分别是什么？

这三个指针把组件树组织成链表结构。child 指向第一个子 Fiber，sibling 指向下一个兄弟 Fiber，return 指向父 Fiber。与传统的树结构用数组存子节点不同，Fiber 的子节点是通过"child 加 sibling 链表"串联的——第一个子节点通过 child 找到，其余子节点依次通过 sibling 连接。相比数组，这种结构每个节点只需要固定数量的指针，也不需要预先知道子节点数量，插入和删除只需改动相邻指针。

这种设计让 React 不依赖 JS 原生调用栈就能控制深度优先遍历。beginWork 阶段通过 child 向下进入子树，completeWork 阶段通过 sibling 横向移动到兄弟节点，没有兄弟了就通过 return 回溯到父节点。关键在于：遍历的"当前位置"保存在一个全局的 workInProgress 指针上，而不是调用栈帧上。这意味着 React 可以在任何一个 Fiber 边界暂停遍历，把控制权交还浏览器，之后再从暂停处继续。如果用的是递归调用栈，一旦进入就无法中断。

### 7. flags 和 subtreeFlags 有什么区别？

**核心结论**：flags 记录当前 Fiber 自身的副作用（插入、更新、删除、绑 ref、执行 effect 等），subtreeFlags 表示整个子树中是否存在某类副作用，是子节点 flags 的按位或冒泡结果；commit 靠它做剪枝，整棵跳过没有副作用的子树。

**详细讲解**：

- **生成时机**：render 阶段 completeWork 向上回溯时，每个节点把子节点的 flags 合并进自己的 subtreeFlags，根节点最终汇总整棵树的副作用概况。
- **为什么需要**：commit 要快速找到有副作用的节点去执行 DOM 操作。如果只有 flags，就必须逐节点遍历检查；而真实应用中一次更新往往只涉及少数几个节点，绝大部分子树是"干净"的。有了 subtreeFlags，遍历时发现子树不含目标类型的副作用，就可以整棵跳过，不必进入子树内部。
- **设计取舍**：每个节点多存一个位标记字段，用少量空间换 commit 遍历的剪枝能力。早期版本维护一条副作用链表，后来改为 subtreeFlags 方案，避免了额外链表的维护成本，剪枝逻辑也更简单。

**常见误区**：以为 subtreeFlags 记录了"子树里哪个节点有什么副作用"——它只回答"有没有某类副作用"，具体节点仍要进入子树后逐个检查 flags。

**延伸追问**：追问常落在"subtreeFlags 什么时候生成"。要点：render 阶段 completeWork 逐层冒泡生成，commit 只是消费方，两边通过 flags 体系解耦。

### 8. beginWork 和 completeWork 为什么分开？

React 的 render 是深度优先遍历，beginWork 和 completeWork 分别对应遍历的"递"和"归"两个阶段。

beginWork 是向下走的过程，主要职责是根据当前 Fiber 的类型计算子 Fiber。对于函数组件，它会执行组件函数并处理 Hooks；对于 HostRoot，它会处理更新队列得到新的 children；对于 ContextProvider，它会把新的 value 压入上下文栈并检测变化。beginWork 返回子 Fiber 后，work loop 就递进到子节点继续处理。

completeWork 是向上回溯的过程。当一个 Fiber 的所有子 Fiber 都处理完毕后，React 才进入它的 completeWork。这个阶段的主要职责是：对于 HostComponent，mount 时创建 DOM 实例并把已收集的子代 DOM 挂到实例上，update 时比较新旧 props 标记更新；对于所有类型，最后都会把子节点的 flags 和 childLanes 冒泡到当前节点的 subtreeFlags 和 childLanes 上。

之所以要分开，是因为父节点的 complete 工作依赖于子节点已经全部完成。比如创建 DOM 实例时需要把所有子代 DOM 节点挂上去，而子代节点在 beginWork 阶段可能还没创建完。只有当所有子 Fiber 都在 completeWork 中处理完毕后，父节点才能安全地收集子代 DOM 并完成自身。

### 9. render 阶段和 commit 阶段的核心区别是什么？

**核心结论**：render 是纯计算——生成 workInProgress 树和副作用标记，不修改任何外部世界，可以中断、重做、整树丢弃；commit 把计算结果应用到真实 DOM、ref 和 effect，一旦开始必须同步原子完成。

**详细讲解**：

- **render 为什么可断**：只操作内存中的 Fiber 链表，失败或被丢弃后基于 current 重新计算不产生任何副作用。时间片用尽的暂停、更高优先级到来后的丢弃重做，都发生在这一阶段。
- **commit 为什么不可断**：中途中断会让页面处于一半新 UI、一半旧 UI 的不一致状态；而且 DOM 操作有先后依赖——先插入子节点才能插入父节点、先删除旧节点才能放置新节点——打断会破坏这些依赖。
- **原子性边界**：mutation 修改 DOM、切换 current 指针、layout 绑定 ref 是一个同步原子块；useEffect 的 passive effect 在 commit 后异步调度执行，不影响 DOM 结构，不破坏原子性。

**常见误区**：把 useEffect 说成"commit 阶段同步执行"——它是 commit 安排的后续异步 flush，真正同步执行的是 layout effect；passive 延后恰恰是为了不阻塞绘制。

**延伸追问**：可能追问"commit 不可断，大列表一次性插入很卡怎么办"。要点：解法是减少单次提交的 DOM 数量（虚拟列表、分批插入），而不是指望 commit 被时间切片。

---

## 二、更新队列与状态

### 10. React 18 和 React 19 各带来了哪些重要变化？

**核心结论**：React 18 的主线是并发渲染落地——更新可以按优先级调度、打断和重试；React 19 的主线是异步动作与服务端生态——Actions、use() 和 ref 简化。面试时按「18 解决调度与优先级、19 解决异步动作与服务端」这条主线组织回答。

**详细讲解**：

- **React 18**：新的 createRoot 入口默认开启并发能力；自动批处理从合成事件扩展到 Promise、原生事件等所有上下文；新增 useTransition 和 useDeferredValue，让开发者主动声明非紧急更新；Suspense 配合流式 SSR 支持选择性 hydration，水合可以按交互优先级分段进行。
- **React 19**：Actions 统一处理表单提交的 pending、错误与乐观更新，配套 useActionState 与 useOptimistic；新增 use() 可以在组件里读取 Context 或 thenable，且允许条件调用；ref 可以直接作为函数组件的 prop，减少 forwardRef 样板；还有文档级元数据标签与 Server Components 的进一步落地。

**常见误区**：把 React 19 理解为"又一个并发版本"——19 的主线是 Actions 与服务端生态，并发基建在 18 已经落地，两者重心不同。

**延伸追问**：可能追问「18 的并发能力是怎么做到的」。要点：Fiber 可中断工作单元、Lane 优先级、Scheduler 时间切片、双缓存四者配合，这正是本题展开的方向。

### 11. setState 后 React 为什么不是立刻更新 DOM？

**核心结论**：setState 的本质是创建一个 Update 对象入队，再由 root 统一调度 render，它是一次"更新请求"而不是"立即执行"；延迟执行换来了批处理、优先级和可中断性。

**详细讲解**：

- **批处理**：同一个事件回调中多次 setState 产生的多个 Update，会在同一次 render 中被统一处理，避免频繁的重复渲染。
- **优先级区分**：不同的 setState 来自不同上下文——用户输入是紧急的，transition 回调中的是非紧急的——React 需要根据优先级决定先处理哪些。
- **可中断性**：低优先级的更新可以被延后或打断，等高优先级工作完成后再恢复。
- **流程统一**：无论更新来源是事件回调、异步数据恢复还是定时器，最终都走同一条 render 到 commit 的管线，保证行为一致。

如果 setState 当场就改 DOM，这四个能力一个都保不住——这就是 React 选择"入队加调度"而不是"立即执行"的根本原因。

**常见误区**：把"不立刻更新"解释成"setState 是异步函数"——入队动作本身是同步的，延迟的是渲染时机，目的是调度灵活性而不是模拟异步语义。

**延伸追问**：常追问"那 flushSync 是什么"。要点：它强制同步完成 render 和 commit，用于必须立即读取更新后 DOM 的场景，代价是牺牲批处理和调度空间，应谨慎使用。

### 12. setState 到底是同步还是异步的？

**核心结论**：setState 本身是同步执行的，立刻创建 Update 并入队；但 state 和 DOM 的更新被推迟到下一次 render 完成，所以表现上像异步。回答的关键是把「执行时机同步、渲染时机延迟、读取值是快照」三层分开讲。

**详细讲解**：

- **执行时机同步**：调用 setState 的瞬间，Update 就已创建入队、优先级也已冒泡，这一步没有延迟。
- **渲染时机延迟**：state 和 DOM 的更新在之后的 render 中完成，延迟来自批处理——同一事件回调里的多次 setState 合并成一次 render，避免重复计算。React 18 之前只有合成事件回调里自动批处理，Promise 或原生事件里的更新会各自触发 render；18 之后自动批处理覆盖所有上下文。
- **读取值是快照**：连续多次 setState 后读取到的仍是本次 render 闭包里的旧值，这是快照语义而不是异步。要基于最新值累计，应使用函数式更新。

**常见误区**：直接回答「setState 是异步的」——这在 18 之后的自动批处理语境下已不准确，准确说法是渲染时机延迟而非函数调用异步。

**延伸追问**：常追问「setState 后立刻读 state 拿到什么」。要点：拿到的是当前 render 闭包里的旧值快照，新值要在下一次 render 才能读到。

### 13. 多次 setState 是如何合并的？

**核心结论**：多次 setState 产生的多个 Update 进入同一个环形链表队列，下一次 render 时按顺序逐个处理——函数式更新基于前一个计算结果，直接值直接覆盖——所谓"合并"是在一次 render 中统一处理所有 Update，而不是只保留最后一个值。

**详细讲解**：

- **入队与遍历**：同一事件回调中的多次 setState 各自创建 Update，串进同一个环形队列；render 阶段 React 按顺序遍历整个队列，用内置的状态合并逻辑逐个计算——action 是函数就用前一个计算结果作为参数调用它，是值就直接覆盖——最终得到一个合并后的 state。
- **为什么按顺序而不是取最后一个**：状态更新有顺序语义，函数式更新必须链式累计，直接覆盖会丢失中间计算。按序遍历让最终结果与"不分批逐个执行"完全一致。
- **直接值与函数式的差异**：如果 action 是直接值（如 setCount(count + 1)），它捕获的是当前闭包中的旧值，连续调用多次可能都基于同一个旧值，结果只加一次；函数式更新会依次接收前一个 Update 的计算结果，能正确累加。

追问通常延伸到 Update 对象本身和队列为什么选环形链表——Update 只携带 action、lane 等信息，环形单链表只保存尾指针，追加和拼接队列都是常数时间，也天然支持低优先级更新被跳过后克隆进 base queue 按原顺序重放。

**常见误区**：把"合并"理解成"后面的 setState 覆盖前面的"——React 是逐个执行所有 Update，批处理省的是 render 次数和中间 UI 提交，不是状态计算。

**延伸追问**：可能追问"那多次更新会不会触发多次 render"。要点：同一批、同一优先级的更新共享一次 render；不同优先级的更新仍可能分开渲染。

### 14. setCount(count + 1) 连续调用和函数式更新有什么区别？

setCount(count + 1) 捕获的是当前 render 闭包中的 count 值。假设当前 count 为 0，那么 setCount(count + 1) 连续调用三次，三个 Update 的 action 都是 1（因为闭包中 count 都是 0）。render 阶段处理时：第一个 Update 把 state 从 0 变为 1，第二和第三个也把 state 设为 1（因为它们的 action 是值 1，不是函数）。最终 state 是 1，只加了一次。

而 setCount(c => c + 1) 连续调用三次，三个 Update 的 action 都是函数。render 阶段依次处理：第一个把 0 变为 1，第二个把 1 变为 2，第三个把 2 变为 3。最终 state 是 3，正确加了三次。

这道题本质上考的是两个知识点：一是函数组件每次 render 创建新闭包，事件回调捕获的是那次 render 的值；二是 Update 队列是按顺序处理的，函数式更新总是基于前一个 Update 的结果计算，不会受闭包旧值影响。

### 15. 什么是批处理？

**核心结论**：批处理是指多个 Update 先分别入队并标记优先级，React 延后执行 flush，用更少的 render 和 commit 统一计算结果。它减少的是重复调度和中间 UI 提交，而不是把多个 Update 覆盖成一个——队列仍会按顺序计算最终 state。

**详细讲解**：

- **批的是什么**：批的是渲染次数。同一批中的多个 Update 在同一次 render 中被顺序处理，只产生一次 commit，避免中间状态反复上屏。
- **React 18 的扩展**：使用 createRoot 时，自动批处理从合成事件扩展到 Promise、setTimeout、原生事件等所有上下文，异步回调中的多次 setState 也会合并为一次 render。
- **批处理不等于同优先级**：同一批中可以同时产生紧急 Lane 和 TransitionLane，React 仍可能分多次 render 和 commit。
- **逃生通道**：确实需要立即同步读取更新后的 DOM 时可以用 flushSync，但它牺牲调度和合并空间，应谨慎使用。

**常见误区**：以为批处理意味着"只保留最后一次 setState 的值"——所有 Update 都会按顺序参与计算，批处理省的是渲染次数，不是状态计算。

**延伸追问**：可能追问"批处理和异步微任务是什么关系"。要点：React 通过事件回调结束等边界触发 flush，同步优先级走微任务尽快执行，而不是简单等一个固定的异步时机。

### 16. 什么是 eagerState 优化？

eagerState 是把原本在 render 阶段进行的状态计算，保守地提前到 dispatch 阶段。当当前 Fiber 和它的 alternate 都没有待处理的 Lane 时，说明这个 setState 是该 Fiber 的第一个更新，React 可以用上次渲染的状态作为基准，预计算新状态。

如果预计算的结果和当前状态相同（通过 Object.is 判断），React 仍然会把 Update 入队以维持队列语义，但不会为它调度 root——省掉的是从调度到 render/commit 的整条管线。如果结果不同或条件不满足，就回到正常的入队和调度流程。典型受益场景是连续 setState 同一个值时不触发多余渲染。

这个优化必须保守，因为队列已有更新时上次渲染的状态不一定是该 action 的真正计算基准。eagerState 是快速路径，不改变 setState 的正确性语义。

### 17. 为什么低优先级 update 被跳过后不能丢掉？

低优先级 update 在本轮 render 中不被处理，只表示它不属于当前处理的优先级，不表示用户的更新意图无效。React 会把被跳过的 update 克隆到一个新的 base queue 中，等以后以更合适的优先级重新计算。

更关键的是，被跳过 update 后面那些已经被执行过的 update 也要被克隆进 base queue，但它们的优先级标记会清空，保证未来重放时一定参与计算。原因是状态更新有顺序语义。假设队列是"低优先级 +10，高优先级 ×2"，本轮可以只执行 ×2，但以后处理 +10 时必须再按原顺序重放 ×2，才能得到与不分优先级时一致的最终结果。所以 base queue 本质上不是"剩余任务列表"，而是为了在插队之后恢复确定性状态结果的重放日志。

### 18. 状态更新为什么需要 lane？

**核心结论**：lane 是 React 用位掩码表示更新优先级和批次的模型。并发场景下同一组件可能同时存在多个不同优先级的 update，没有 lane，React 无法区分哪些更新必须马上处理、哪些可以延后、哪些因 Suspense 挂起、哪些可以被重试。

**详细讲解**：

- **表达多维状态**：同一个组件可能同时有紧急的用户输入、非紧急的 transition 更新、被挂起的异步数据。lane 不只回答"多急"，还回答"这批更新处于什么状态"。
- **三层落地**：update 自带 lane 表示紧急程度；沿途组件及其祖先的优先级标记被更新，告诉遍历这棵子树里有没有该优先级的工作；最终汇总到 root 的集合里参与调度。同一批触发的更新共享同一个 lane，这也是"批次"的含义。
- **位掩码的优势**：多个 lane 可以按位或合并成集合，取最高优先级、判断包含关系、移除已完成更新都是常数时间位运算，能同时表达"哪些待处理、哪些被挂起、哪些被 ping"等多种状态集合。

**常见误区**：把 lane 等同于线程优先级或任务队列的优先级——lane 是 reconciler 内部描述更新集合与状态的模型，任务何时获得时间片由 Scheduler 层另行决定。

**延伸追问**：可能追问"位掩码相比数字优先级好在哪"。要点：数字只能表达单个级别，位掩码可以多个共存并做集合运算，Suspense 的挂起与重试、多优先级共存都依赖这一点。

### 19. 为什么调度单位通常是 root，而不是单个组件？

虽然更新发生在某个组件上，但最终渲染需要从 root 统一选择优先级并构建一致的 Fiber 树。当某个 Fiber 产生更新时，React 会从该 Fiber 沿父链向上，把 lane 冒泡到每个祖先的 childLanes 上，直到到达 root 并更新其 pendingLanes，然后由 root 统一调度。

以 root 为调度单位有几个原因。首先，多个组件可能同时有更新，需要 root 统一选择最高优先级来决定先处理哪个。其次，bailout 机制需要从 root 开始逐层判断哪些子树需要更新。第三，Suspense 边界和 Context Provider 可能在祖先节点上，子树的更新可能需要它们参与。第四，commit 必须是原子的，整棵树一起提交才能保证 UI 一致性。所以组件是更新来源，root 是调度入口。

---

## 三、Lane 与优先级

### 20. Lane 是什么？

**核心结论**：Lane 是 React 用位掩码表示更新优先级和批次的模型——每一个 bit 对应一种优先级，低位 bit 表示更高优先级；多个 lane 可以按位或合并成集合，同一批触发的更新共享同一个 lane。

**详细讲解**：

- **位结构**：低位表示高优先级，React 定义了从高到低的多个级别——同步 Lane（用户输入等最高优先级）、连续输入 Lane、默认 Lane、Transition Lane（非紧急更新）和空闲 Lane。
- **三层落地**：update 自带 lane 表示它的紧急程度；沿途组件及其祖先的优先级标记被更新，告诉遍历"这棵子树里有没有该优先级的工作"；最终汇总到 root 的集合里参与调度。
- **批次的含义**：同一批触发的更新共享同一个 lane，这让调度可以把一次交互产生的多个更新当作一个整体处理。

**常见误区**：把 lane 想成一个"表示第几档"的单一数字——实际上每个 lane 是独立的一个 bit，多个 lane 可以共存并合并成集合，一次待处理的更新集合本身就包含多条 lane。

**延伸追问**：可能追问"怎么从 lane 集合里选出最高优先级"。要点：低位表示高优先级，取出集合中最低位的 1 就是最高优先级 lane，纯位运算即可完成，常数时间。

### 21. 为什么 React 使用 Lane，而不是简单的优先级数字？

**核心结论**：数字只能表达单个优先级级别，而并发渲染需要同时表达多个更新及其状态（待处理、被挂起、可重试）；Lane 用位掩码表达多个集合，合并、选择、判断全部是常数时间位运算。

**详细讲解**：

- **多维状态集合**：root 维护三个集合——pendingLanes（所有未完成更新）、suspendedLanes（因 Suspense 挂起）、pingedLanes（数据就绪可重试）。每次从 pending 中排除 suspended 取最高优先级执行，没有可执行的再从 pinged 中找可重试的——这种多维度状态数字表达不了。
- **全是位运算**：合并是按位或，取最高优先级是取最低有效位，包含判断是按位与，移除已完成更新是清位——全部常数时间。
- **服务并发场景**：Suspense 的挂起与重试、Transition 的打断与恢复、多优先级共存，都依赖对这类集合的运算。Lane 不只是优先级，更是批次和状态集合。

**常见误区**：以为用数字只是"不够方便"但也能做——真正的难点是单个数字无法同时表达"这批更新既待处理又被挂起"，要表达各种组合状态只能另造机制；位掩码让这些状态天然是集合运算。

**延伸追问**：可能追问"Suspense 是怎么参与 lane 调度的"。要点：抛出 thenable 时把对应 lane 移入挂起集合，resolve 后移入可重试集合并重新调度，本质就是对集合的位运算。

### 22. Lane 和 Scheduler priority 是一回事吗？

不是一回事，两者是不同层次的优先级。Lane 是 reconciler 内部描述更新优先级、批次和状态的模型；Scheduler priority 是底层任务调度器用来安排 callback 执行顺序的优先级。React 会把 lane 映射成 Scheduler priority 来调度任务——比如同步 Lane 映射到最高任务优先级，Transition Lane 映射到普通任务优先级。

两者回答的问题不同：Lane 回答"React 这次要处理哪类更新、哪些更新待处理或挂起"，Scheduler priority 回答"这个 callback 应该以什么任务优先级运行、何时获得时间片"。有关联但层次不同。一个典型的例子：默认 Lane 和 Transition Lane 都映射到普通任务优先级，但 React 内部对它们的处理语义完全不同——Transition 可以被更高优先级打断并暴露 isPending 状态，默认 Lane 不能。

### 23. SyncLane 为什么通常不走 Scheduler 的普通任务队列？

同步 Lane 表示最高优先级的更新，需要尽快完成。如果交给 Scheduler 的宏任务队列，会多一层事件循环延迟。React 通常把同步更新收集到同步队列中，然后通过微任务在当前调用栈结束后统一执行，保证用户输入、离散事件或显式同步更新尽快反映到 UI。

之所以不直接在 setState 当场同步渲染，是为了保留批处理能力——同一轮中的多个同步更新仍然会被合并为一次 render。微任务时机刚好卡在"当前回调全部执行完、浏览器还未绘制"的位置，既比宏任务快，又不牺牲合并。

### 24. lane 为什么要向父节点冒泡？

当某个 Fiber 产生更新时，React 不只标记当前 Fiber 的 lanes，还会把 lane 冒泡到父级的 childLanes，一直冒泡到 root。这样父节点在 beginWork 的 bailout 判断时可以知道子树里是否有当前优先级的更新。

如果没有 childLanes 冒泡，就会出现问题：假设孙子组件有 state 更新，但父组件和中间组件的 props/state 都没变。父组件会命中 bailout 并跳过整棵子树，孙子组件的更新就丢失了。childLanes 的冒泡让 React 在 bailout 时能正确判断"虽然我自己没有工作，但我的后代有"——如果子树也有工作，就只跳过当前组件函数的执行，但继续沿 childLanes 指示的路径向下处理。

### 25. 优先级调度如何实现"高优先级打断低优先级"？

**核心结论**：打断分两步——高优更新到来时先在调度层重新排程（取消旧任务、按新优先级重新调度）；执行时在 Fiber 工作单元边界发现最高优先级已变，就丢弃当前 WIP 树，先完成高优渲染，低优更新保留下来之后再重放。

**详细讲解**：

- **标记与重新排程**：高优更新到来时，先把 Lane 标记到目标 Fiber、祖先 childLanes 和 root 的待处理集合上。然后 React 比较当前已调度任务的优先级和最新最高优先级——相同就复用已有调度，不同就取消旧任务、以新优先级重新调度。
- **打断点与丢弃重做**：并发 work loop 在每个 Fiber 边界检查是否应该让出。当高优任务获得执行机会后，如果当前正在构建的 WIP 树的优先级与新的最高优先级不同，React 会丢弃当前 WIP，基于 current 树重新准备，先完成高优 render 和 commit。
- **低优更新不消失**：旧的低优 update 仍留在更新队列和 root 的待处理集合中，高优任务完成后会再次调度、按原顺序重放。
- **打断的边界**：打断不是在组件函数执行到一半时抢占，也不是两个 render 同时运行；可中断点位于 Fiber 工作单元之间。

**常见误区**：以为打断意味着"低优更新被直接扔掉"——被丢弃的只是 WIP 树上的计算，更新本身会保留并重放；也不要把它说成两个 render 并行，打断只发生在工作单元边界。

**延伸追问**：可能追问"打断的正确性靠什么保证"。要点：render 不修改外部世界所以可以丢弃重来；双缓存让 current 始终代表已提交 UI；被跳过的 update 靠 base queue 重放保证状态确定性。

### 26. 什么是饥饿问题，React 如何缓解？

**核心结论**：饥饿指低优先级工作反复被高优更新插队、长期得不到执行；React 在 Scheduler 层用任务过期机制、在 Lane 层用挂起与重试机制来缓解，在输入响应性和最终完成之间取得平衡。

**详细讲解**：

- **Scheduler 层的过期机制**：不同优先级的任务有不同的超时时间——最高优先级几乎立刻过期，用户阻塞级很快过期，普通优先级较长，空闲级可以很久。任务一旦到期，即使当前时间片已经用尽也不再主动让出，而是优先执行完毕。这样低优任务无论被插队多少次，最终一定会被执行。
- **Lane 层的挂起与重试**：被 Suspense 挂起的 lane 进入挂起集合，数据就绪后通过 ping 进入可重试集合并重新调度。长期挂起的更新会在条件满足时获得重试机会，而不是一直被排除在选择之外。
- **设计目标**：高优先级要快，但低优先级不能永远等不到——这是响应性和吞吐之间的权衡。

**常见误区**：以为防饥饿靠"压低高优先级的执行机会"——实际上高优的响应性不被削弱，防饥饿靠的是给低优任务一个最终必执行的保证（过期机制）。

**延伸追问**：可能追问"任务到期后和同步执行有什么区别"。要点：到期任务仍在调度流程中执行，只是不再让出时间片，效果上接近一次完成，但优先级语义和批处理能力仍然保留。

---

## 四、Scheduler 与时间切片

### 27. Scheduler 在 React 中解决什么问题？

**核心结论**：Scheduler 解决"什么时候执行哪个任务、执行多久要让出主线程"。React 组件树很大时，一次同步 render 太久会阻塞浏览器处理输入、动画和绘制；Scheduler 通过任务优先级和时间切片，让 React 可以把长任务拆开执行。

**详细讲解**：

- **两层调度体系**：reconciler 用 lane 决定更新优先级和渲染内容——"这次要处理哪类更新"；Scheduler 用 callback priority、deadline、shouldYield 决定 JS 任务如何分片执行——"这个 callback 何时获得时间片、执行多久"。
- **协作方式**：React 把 lane 映射成 Scheduler priority 来调度 root 的并发工作 callback，callback 内部的 work loop 才真正处理 Fiber、判断 shouldYield、完成 render。

**常见误区**：把 lane 和 Scheduler priority 混为一谈——前者是 reconciler 内部描述更新集合与状态的模型，后者是底层任务调度器用来安排 callback 执行顺序的优先级。

**延伸追问**：可能追问"Scheduler 怎么知道 Fiber 和 DOM"。要点：它不知道——Scheduler 只管调度时机，Reconciler 管渲染逻辑，两者通过 callback 接口解耦。

### 28. 时间切片是什么？

**核心结论**：时间切片是把一次可能很长的 render 拆成多个宿主任务片段。React 仍然逐个同步处理 Fiber，但并发 work loop 会在每个 Fiber 边界检查 shouldYield——如果当前时间片用尽，就保留进度指针并退出循环，把主线程还给浏览器；下一个时间片从暂停的 Fiber 继续。

**详细讲解**：

- **目标**：不是减少总计算量，也不是让 JS 变成多线程，而是降低单个长任务的连续占用时间。
- **边界**：只能切分 render 阶段的工作单元之间的边界，不能切开某个很慢的组件函数内部，也不会中断需要原子完成的 commit。因此如果单个组件本身就执行几十毫秒，时间切片也帮不了忙，需要拆分或优化组件计算本身。

追问通常延伸到暂停之后如何继续——本轮没跑完的 callback 会返回一个表示剩余工作的 continuation 函数，Scheduler 在下一个时间片直接调用它，React 从暂停的 Fiber 接着处理，而不是重新开始。

**常见误区**：以为时间切片能减少总工作量——它只是把长任务拆成多个短任务，总计算量不变，优化的是响应性而非吞吐量。

**延伸追问**：可能追问"时间切片和 Web Worker 有什么区别"。要点：时间切片仍在主线程执行，只是主动让出控制权；Worker 是真多线程，但无法直接操作 DOM，且通信成本高。

### 29. shouldYield 根据什么判断是否让出主线程？

最核心的判断是当前时间是否超过本轮任务的 deadline。任务开始时 React 会计算 deadline（当前时间加上一个帧间隔），work loop 中不断比较当前时间是否超过 deadline。如果超过，说明时间片已用尽，应该让出主线程。

更完整的实现还可能考虑是否有更高优先级任务到达、浏览器是否需要绘制、是否有 pending input 等信号。但核心思路就是 deadline 检查。shouldYield 不是让任务消失，而是让任务暂停——callback 返回一个 continuation 函数表示剩余工作，Scheduler 在下一个时间片继续执行。

### 30. 为什么 render 阶段可以让出，commit 阶段不能让出？

**核心结论**：render 阶段只在内存中计算 workInProgress 树，生成 Fiber 节点和副作用标记，没有修改 DOM、没有执行 ref、没有运行 effect，让出或重做都不会让用户看到中间状态；commit 阶段会实际插入、删除、更新 DOM，并执行 ref 绑定和 layout effect，中途中断会让页面处于不一致状态。

**详细讲解**：

- **render 为什么可断**：只操作内存中的 Fiber 链表，屏幕上显示的始终是 current 树对应的已提交 UI。让出或重做都没有副作用。
- **commit 为什么不可断**：DOM 操作的顺序往往有依赖关系——先插入子节点才能插入父节点，先删除旧节点才能放置新节点——中途打断会破坏这些依赖，页面可能出现一半新 UI、一半旧 UI。

**常见误区**：以为 commit 也可以像 render 一样时间切片——实际上 commit 必须保持原子性，尽快同步完成。

**延伸追问**：可能追问"那大列表一次性插入很卡怎么办"。要点：解法是减少单次提交的 DOM 数量（虚拟列表、分批插入），而不是指望 commit 被切片。

### 31. Scheduler 为什么常用 MessageChannel，而不是 requestIdleCallback？

**核心结论**：requestIdleCallback 的兼容性、触发时机和后台行为不够稳定——空闲时间由浏览器决定，React 无法控制什么时候能获得执行机会，且在后台标签页中可能完全不触发；MessageChannel 可以更稳定地创建宏任务，延迟低，不受嵌套 setTimeout 的最小延迟限制。

**详细讲解**：

- **控制权**：React 需要自己控制 deadline 和任务优先级，因此更倾向于使用 MessageChannel 驱动 work loop，再在 JS 层判断 shouldYield。这样 React 对调度时机有完全的控制权。
- **稳定性**：MessageChannel 不受嵌套调用深度影响，延迟稳定，适合连续调度时间片。

**常见误区**：以为用 requestIdleCallback 更符合"空闲时执行"的语义——实际上 React 需要精确控制时间片长度，不能把时机完全交给浏览器。

**延伸追问**：可能追问"为什么不用 setTimeout"。要点：setTimeout 有最小延迟限制（嵌套调用超过一定深度后变为 4ms），调度精度较差；MessageChannel 延迟更低且稳定。

### 32. Scheduler 和 Reconciler 的边界是什么？

Scheduler 负责"何时执行 callback"——它不知道 Fiber、Lane、DOM、Hooks，也不决定 render 结果。Reconciler 负责"callback 里处理哪些更新以及如何生成下一棵 Fiber 树"。

React 根据 pendingLanes 选出 nextLane，把 lane 映射成 Scheduler priority，再把 performConcurrentWorkOnRoot 交给 Scheduler。Scheduler 在合适的时间片执行这个 callback；callback 内部的 work loop 才真正处理 Fiber、判断 shouldYield、完成 render 或进入 commit。两者各司其职，Scheduler 管调度时机，Reconciler 管渲染逻辑。

---

## 五、Diff 与 Reconciliation

### 33. React Diff 为什么能做到近似 O(n)？

**核心结论**：通用树编辑距离是 O(n³)，React 通过三个启发式假设主动缩小问题空间：只比较同层 children、不同 type 直接删除重建、同层节点用 key 表达稳定身份，使每层 children 通常只需遍历一次，整体接近 O(n)。

**详细讲解**：

- **三个假设**：只比较同一父节点下的 children（牺牲跨层移动的最优复用）；不同 type 视为不同子树（直接删除重建，避免比较内部结构）；同层节点通过 key 表达身份（让 React 能在 Map 中快速查找复用）。
- **快速路径**：官方 React 并不是一开始就建 Map，而是先从左往右同时遍历新旧 children 逐对比较——key 和 type 都匹配就复用并继续往右走，一旦 key 不匹配就跳出快速路径。只有快速路径没走完时，才退化到 Map 方案处理剩余的乱序节点。
- **移动判断**：每个复用节点还会比较旧 index 和 lastPlacedIndex 判断是否需要移动，遍历结束后 Map 中剩余的旧节点就是需要删除的。

**常见误区**：以为 Diff 在任何输入下都是 O(n)——实际上这是启发式算法在常见场景中的近似 O(n)，极端乱序场景会退化到 Map 方案，仍有额外成本。

**延伸追问**：可能追问"为什么不做跨层移动优化"。要点：跨层移动在 UI 中相对少见，检测会显著增加复杂度；React 更关注大多数列表更新场景下的稳定性能，而不是追求理论最优的树编辑距离。

### 34. key 的本质作用是什么？

**核心结论**：key 用来在同层兄弟节点中标识稳定身份，帮助 React 在列表顺序变化、插入、删除时判断哪些旧 Fiber 可以复用，从而保留组件状态并减少 DOM 操作。

**详细讲解**：

- **本质**：key 是 reconciler 的身份标识——Diff 算法用它在 Map 中查找对应的旧节点。好的 key 应该稳定、唯一、能反映业务实体身份，比如数据项的 id。
- **不是什么**：key 不是为了消除 warning，也不是传给组件的普通 props。用随机数或时间戳做 key 是错误的，因为每次 render 都不同，React 会认为身份变了，导致删除重建。

追问通常延伸到 key 与性能的关系——很多列表性能问题不是 Diff 本身慢，而是 key 不稳定导致复用失败、整列删除重建，稳定 key 是列表性能优化的基础。

**常见误区**：以为 key 只是用来消除控制台警告——实际上它是 Diff 算法正确识别节点身份的关键，直接影响复用效率和状态保留。

**延伸追问**：可能追问"为什么不建议用 index 作为 key"。要点：index 只表示位置不表示身份，列表插入删除时 index 会变，导致 React 用错误的旧 Fiber 复用新元素，状态串位。

### 35. 为什么不建议用 index 作为 key？

**核心结论**：index 只表示当前位置，不表示真实身份。当列表插入、删除、排序时，同一个数据项的 index 会变化，导致 React 用错误的旧 Fiber 复用新元素，状态串位。

**详细讲解**：

- **问题场景**：在列表头部插入一个新元素，原来 index 为 0 的元素变成 index 为 1，React 会用 index 0 对应的旧 Fiber 去复用新元素——两者的 type 可能相同但数据完全不同，导致状态串位。
- **经典案例**：输入框列表用 index 做 key 时，在第一个输入框打字后删除最后一个 item，输入框的内容可能串到错误的位置。
- **安全场景**：只有列表完全静态、不排序、不插入删除时，index 作为 key 才相对安全。但真实业务中更建议使用稳定的 id。

追问通常延伸到 key 与性能的关系——很多列表性能问题不是 Diff 本身慢，而是 key 不稳定导致复用失败、整列删除重建，稳定 key 是列表性能优化的基础。

**常见误区**：以为用 index 做 key 只是"性能差一点"——实际上会导致状态串位、DOM 操作增多、组件生命周期错乱，是功能正确性问题。

**延伸追问**：可能追问"那什么时候可以用 index"。要点：列表完全静态（不排序、不插入删除）时可以用，但真实业务中更推荐用稳定的业务 id。

### 36. 单节点 Diff 如何判断复用？

React 先比较 key 再比较 type。如果 key 相同并且 type 相同，说明可以复用旧 Fiber——React 会克隆旧 Fiber 并更新 props，同时把剩余的旧兄弟节点标记为删除。如果 key 相同但 type 不同，旧节点不能复用，因为组件类型或宿主节点类型变了，原来的状态和 DOM 结构不再可靠，需要删除所有旧节点并创建新 Fiber。如果 key 不同，当前旧节点不能复用，React 会把它标记删除并继续检查下一个旧兄弟节点。

key 相同但 type 不同也不能复用，这是一个容易忽略的细节——比如从 div 变成 span，即使 key 一样，DOM 节点类型变了，原来的属性和子结构都不适用了。

### 37. 多节点 Diff 的大致流程是什么？

**核心结论**：多节点 Diff 分为四个阶段——先用从左往右的快速路径处理顺序匹配，覆盖不住时才退化到 Map 方案处理乱序节点，最后用 lastPlacedIndex 判断是否需要移动。render 阶段只打标记，真正的 DOM 操作留到 commit。

**详细讲解**：

官方 React 的多节点 Diff 分为四个阶段，核心思想是先用快速路径处理最常见的顺序匹配场景，只在必要时才退化到 Map 方案。

**第一阶段：从左往右顺序比较。** React 同时遍历新旧 children，从左到右逐对比较。如果 key 和 type 都相同，直接复用旧 Fiber 并更新 lastPlacedIndex，然后新旧指针同时右移继续比较。一旦遇到 key 不匹配，立即跳出本阶段。这个快速路径覆盖了"列表末尾追加或删除"这种最常见的场景——大部分节点能顺序匹配完，不需要建 Map。

**第二阶段：新 children 遍历完 → 删除剩余旧节点。** 如果第一阶段中新 children 已经遍历完，说明所有新节点都顺序匹配了，剩余的旧节点全部标记为 ChildDeletion 即可结束。

**第三阶段：旧 children 遍历完 → 为剩余新节点创建 Fiber。** 如果第一阶段中旧 children 已经遍历完，说明旧节点都复用了，剩余的新节点需要新建并标记 Placement。

**第四阶段：乱序处理 → Map 方案。** 只有前三个阶段都没有覆盖完（即第一阶段因 key 不匹配而中途退出，新旧 children 都还有剩余），React 才把剩余的旧 children 按 key 存入 Map，再遍历剩余新 children 在 Map 中查找复用。每个复用节点同样比较旧 index 和 lastPlacedIndex 判断是否需要移动。最后 Map 中没被消费的旧节点标记为 ChildDeletion。

对于每个复用的节点，React 会比较它在旧 children 中的 index 和 lastPlacedIndex。lastPlacedIndex 记录的是已处理节点中能保持相对顺序的最大旧 index。如果旧 index 小于 lastPlacedIndex，说明这个节点相对位置倒退了，需要移动（标记 Placement）；如果大于等于，说明可以留在原位，并更新 lastPlacedIndex。对于新创建的节点，直接标记 Placement。

render 阶段只负责打标记，真正的 DOM 移动和删除留到 commit 阶段执行。

追问通常延伸到移动判断是否追求最优——lastPlacedIndex 策略只保证已处理节点的相对顺序，不追求最少移动次数，这是性能与算法复杂度的取舍。

**常见误区**：以为多节点 Diff 总是一开始就建 Map——实际上 React 先用快速路径处理顺序匹配，只有乱序场景才退化到 Map，这是启发式优化。

**延伸追问**：可能追问"lastPlacedIndex 是什么"。要点：它记录已处理的可复用节点中能保持相对顺序的最大旧 index，用于判断当前节点是否需要移动。

### 38. 为什么 React 不做跨层级移动优化？

跨层级移动检测会显著增加算法复杂度——需要维护全局的节点索引并在整棵树中搜索匹配。而且 UI 中跨层移动相对少见，大多数列表更新都是同层的位置变化。

React 选择只比较同层节点。如果节点从 A 的子树移动到 B 的子树，React 会视为 A 中删除 + B 中创建，原来的组件状态和 DOM 不会跟着移动。这是一个性能和复杂度的取舍——React 更关注大多数列表和组件更新场景下的稳定性能，而不是追求理论最优的树编辑距离。

### 39. Fragment 如何参与 Diff？

Fragment 自身没有真实 DOM，但它有 Fiber，可以作为一组 children 的容器参与 Diff。带 key 的 Fragment 还能在列表中作为一个稳定单元被复用。

commit 时 Fragment 不会创建宿主节点，但它的子节点仍然会正常插入、删除和更新。Diff 过程中，Fragment 的 children 会像普通节点的 children 一样被处理。

---

## 六、Hooks

### 40. Hooks 为什么不能写在条件语句中？

**核心结论**：React 完全依赖调用顺序来匹配 Hook——本次 render 的第 n 个 Hook 必须对应上次 render 的第 n 个 Hook。条件语句会导致某次 render 少调用某个 Hook，后面的 Hook 全部错位。

**详细讲解**：

- **链表按序匹配**：mount 时 React 按调用顺序依次创建 Hook 节点串成链表；update 时按同样的顺序沿链表依次读取旧 Hook 节点。Hook 不是用变量名或调用位置做索引的，而是完全依赖顺序。
- **错位的后果**：如果一个 Hook 被条件语句包住，某次 render 少调用了它，后面的 Hook 就会读到错误的节点——原本属于 useState 的 Hook 节点可能被 useEffect 匹配到，state、queue 和 deps 全部错位。React 在开发环境会检测 Hook 数量变化并报错，但运行模型本身要求顺序绝对稳定。
- **规则的本质**：不要在循环、条件和可能提前返回之后调用 Hook；自定义 Hook 内部同样要遵守。它不是语法偏好，而是链表按序匹配的结构约束。

**常见误区**：以为这只是 ESLint 的代码风格要求——实际上它是运行时正确性的硬约束，违反会导致 state 和 effect 全部错位。

**延伸追问**：可能追问"为什么不用变量名或 key 匹配 Hook"。要点：Hook 调用发生在普通 JS 函数里，React 拿不到变量名信息；调用顺序是唯一可靠且零开销的索引方式。

### 41. Hooks 存在哪里？

**核心结论**：函数组件的 Hooks 存在对应 Fiber 的 memoizedState 字段上，多个 Hook 通过 next 指针串成链表。函数组件没有实例，状态全部挂在这条链表上。

**详细讲解**：

- **链表结构**：第一个 Hook 挂在 fiber.memoizedState，后续 Hook 依次链接。mount 阶段创建 Hook 链表，update 阶段根据 current Fiber 上的旧链表克隆或复用信息计算新状态。
- **每个 Hook 节点的内容**：memoizedState 对于 useState 是当前 state 值，对于 useEffect 是 Effect 对象（包含 create、destroy、deps），对于 useRef 是 ref 对象；updateQueue 对于 useState 是更新队列；baseState 和 baseQueue 用于低优先级 update 被跳过时的重放。

**常见误区**：以为 Hook 状态存在闭包或某个全局 Map 里——实际上存在 Fiber 节点的链表字段上，这也是组件重新执行而状态不丢的原因。

**延伸追问**：可能追问"为什么 useState 状态不会因函数重新执行而丢失"。要点：state 存在 Fiber 的 Hook 链表中，每次 render 按顺序从链表取对应 Hook 的值返回。

### 42. mount 和 update 阶段的 Hooks dispatcher 为什么不同？

mount 阶段没有旧 Hook，需要创建 Hook 节点并初始化 state、queue、effect。update 阶段已经有旧 Hook，需要按顺序读取旧 Hook，处理 update queue，比较依赖数组，生成新的 Hook 链表。两种阶段的行为完全不同。

React 通过不同的 dispatcher 让同一个 useState、useEffect 调用在 mount 和 update 时走不同实现。renderWithHooks 开始时，React 根据 Fiber 的 alternate 是否存在来选择 mount dispatcher 还是 update dispatcher。而 React 导出的 useState 等函数本身只是薄包装——它们通过 resolveDispatcher 获取当前 dispatcher，再委托给 dispatcher 上对应的方法。这样同一个 API 在不同阶段有了不同的行为。

### 43. useState 的 dispatch 为什么能更新对应组件？

mount useState 时，React 为这个 Hook 创建独立的更新队列，并创建一个 dispatch 函数，在其闭包中捕获当前 Fiber 和 queue 的引用。这样事件回调中调用的虽然只是 setCount(action)，但 dispatch 内部已经知道 update 应该写入哪个 Hook 队列、更新起点是哪个 Fiber。

dispatch 的主流程是：请求 Lane → 创建 Update → 加入环形队列 → 给目标 Fiber 和 alternate 标 lanes → 沿 return 给祖先标 childLanes 并找到 root → 更新 root.pendingLanes → 调度 root。它不是直接再次调用组件函数，更不会直接修改 DOM。下一次 render 执行到同一个 useState 时，React 按 Hook 顺序找到 queue，合并 pending queue 和 base queue，按本轮 renderLane 计算新的 memoizedState。

追问通常延伸到 dispatch 的引用为什么稳定——它在 mount 时创建一次并捕获对应的 Fiber 和队列引用，后续每次 render 返回的都是同一个函数，因此作为 props 传给子组件或写进 effect 依赖都不会引发额外更新。

### 44. 为什么 useState 的状态不会因为函数重新执行而丢失？

函数组件重新执行时会重新创建所有局部变量，但 state 不存在函数局部变量里，而是存在 Fiber 的 Hook 链表中。每次 render 调用 useState 时，React 按顺序从 Hook 链表中取出对应 Hook 的 memoizedState 返回。

这也是 Hooks 必须顺序稳定的原因——React 不是通过变量名匹配 state，而是通过调用顺序匹配。第一次 render 的第一个 useState 对应链表第一个 Hook，第二次 render 的第一个 useState 也对应链表第一个 Hook。只要顺序不变，状态就不会错位。

### 45. Hooks 闭包陷阱是什么？

**核心结论**：函数组件每次 render 都会创建新的函数作用域，事件回调捕获的是创建它那次 render 的 state 快照；异步回调稍后执行时读到的可能是过时的 state，因为闭包中的值不会因为后续 render 而更新。

**详细讲解**：

- **成因**：函数组件每次 render 创建新闭包，事件回调（如 onClick 的 handler）捕获的是那次 render 的值。如果这个回调是异步执行的（比如 setTimeout 或 fetch 回调），它稍后执行时看到的可能是过时的 state。
- **典型场景**：在 useEffect 中设置定时器，定时器回调读取 count 值，但 count 在定时器存活期间已经变化多次，回调始终读到旧值。
- **解法**：使用函数式更新（setCount(c => c + 1) 让 React 传入最新 state）；使用 ref 保存可变值（ref.current 始终是最新的，因为 ref 对象引用稳定）；把依赖写完整让 effect 在依赖变化时重新设置定时器；或者重新设计状态管理流程。
- **本质**：闭包陷阱不是 React bug，而是 JS 闭包语义和 React render 模型共同导致的结果。

**常见误区**：把它当成 React 的 bug 或设计缺陷——实际上是 JS 闭包语义的正常表现，React 通过函数式更新和 ref 提供了标准解法。

**延伸追问**：可能追问"useEffect 里的定时器怎么读到最新 state"。要点：函数式更新、ref 保存可变值、或声明完整依赖让 effect 重建，三选一按场景取。

### 46. useEffect 的执行时机是什么？

**核心结论**：useEffect 在 commit 完成后异步执行，通常在浏览器绘制之后。render 阶段只登记 effect，commit 阶段收集后通过 Scheduler 异步调度一次 flush。

**详细讲解**：

- **登记**：render 阶段只登记 effect，不执行用户的 create 函数。mount 时 Hook 保存 effect 并在 Fiber 上标记 PassiveEffect；update 时用 Object.is 逐项比较依赖数组，变化则给 effect 加上 HookHasEffect 标记。
- **收集与异步调度**：commit 阶段看到 PassiveEffect 标记后，不会同步执行 effect 回调，而是把 effect 收集到 root 的待处理列表中，然后通过 Scheduler 异步调度一次 flush。
- **执行顺序**：flush 时，更新类 effect 先执行上一次的 destroy（cleanup），再执行本次的 create 并保存新的 destroy。卸载类 effect 只执行 destroy。这样旧订阅一定先释放，再建立新订阅。
- **时序细节**：通常可以回答"commit 后、浏览器绘制之后异步执行"，但 React 可能根据更新来源和调度策略提前 flush passive effects。如果需要阻止绘制并同步测量或修正布局，应该用 useLayoutEffect。

**常见误区**：以为 useEffect 严格在绘制后执行——实际上只是常见时序，React 可能提前 flush；也不说它属于 commit 的同步阶段——它是 commit 安排的后续异步 flush。

**延伸追问**：可能追问"那 useLayoutEffect 和 useEffect 有什么区别"。要点：layout effect 在 DOM 更新后、绘制前同步执行，可读取布局；passive effect 异步不阻塞绘制。

### 47. useLayoutEffect 和 useEffect 有什么区别？

**核心结论**：useLayoutEffect 在 DOM 更新后、浏览器绘制前同步执行，可读取布局、测量尺寸、同步调整样式；useEffect 通常在绘制后异步执行，不阻塞浏览器绘制。副作用不需要阻塞绘制时应优先用 useEffect。

**详细讲解**：

- **useLayoutEffect**：在 DOM 更新后、浏览器绘制前同步执行，和 mutation 在同一个 commit 流程中，此时 DOM 已经是最新的，因此可以读取布局、测量 DOM 尺寸、同步调整样式等必须在用户看到页面前完成的操作。
- **useEffect**：通常在绘制后异步执行，不会阻塞浏览器绘制。如果副作用不需要阻塞绘制，应优先用 useEffect。
- **性能影响**：滥用 useLayoutEffect 会延长 commit 到绘制之间的时间，影响性能——因为浏览器必须等待 layout effect 执行完才能绘制。

**常见误区**：以为 useLayoutEffect 是"更高级"或"更可靠"的 useEffect 而优先使用——实际上它是逃生通道，只在需要同步读布局时使用，滥用会阻塞绘制。

**延伸追问**：可能追问"在 useLayoutEffect 里 setState 会怎样"。要点：React 可能同步处理这次更新，避免用户看到中间布局状态，但耗时逻辑会拉长 commit 到绘制的间隔。

### 48. useEffect 依赖数组如何比较？

update 时 React 取出上一次 effect 保存的 deps，与本次 deps 按位置逐项用 Object.is 比较。全部相同就只保留 Passive 标记但不加 HookHasEffect，本轮不会执行 cleanup/create。任一项变化则标记需要执行。

不传依赖数组会被当成"无法复用"，每次提交后都执行。空数组在正常生命周期里 mount 后执行一次、卸载时 cleanup。依赖不是"你希望何时执行"的任意开关，而是 effect 闭包读取的所有响应式值清单——漏依赖会让 effect 长期读取旧闭包。依赖项采用引用比较，因此新建对象、数组、函数会被视为变化，需要配合 useMemo/useCallback 稳定引用。

### 49. useEffect 造成死循环的常见原因有哪些？

**核心结论**：最典型的原因是把引用类型的对象或数组放进依赖——它们每次 render 都重新创建，引用比较永远不等，effect 反复执行；如果 effect 里又 setState，就形成循环。

**详细讲解**：

- **引用类型依赖**：最常见。对象或数组每次 render 都新建，引用比较永远不等，effect 反复执行；effect 里又 setState 就形成循环。
- **状态与副作用互推**：依赖里放了由 state 派生的值，而 effect 又更新这个 state 的来源，形成互推循环。
- **基于旧 state 计算**：effect 里基于旧 state 计算新值再 set，值一直在变。
- **解法按顺序排查**：稳定引用（ref、dispatch 这类天生稳定）能移出依赖就移；对象和函数用 useMemo/useCallback 稳定，或把组件定义挪出父组件；基于旧 state 的计算改成函数式更新，去掉对旧值的依赖。

**常见误区**：直接删依赖或关掉 exhaustive-deps 警告来「消灭」报错——那只是把死循环变成隐藏 bug。

**延伸追问**：可能追问"为什么依赖数组用 Object.is 而不是深比较"。要点：深比较成本高且语义模糊，React 选择引用比较配合 useMemo/useCallback 由开发者控制引用稳定性。

### 50. useMemo 和 useCallback 的区别是什么？

**核心结论**：useMemo 缓存计算结果，useCallback 缓存函数引用——useCallback(fn, deps) 基本可以理解为 useMemo(() => fn, deps)，都是根据依赖是否变化决定是否返回新值。

**详细讲解**：

- **主要用途**：避免昂贵计算或稳定引用——比如配合 React.memo 避免子组件因为函数/对象引用变化而重新渲染，或者把某个值作为另一个 Hook 的依赖时避免频繁变化导致 effect 重跑。
- **成本**：它们本身也有依赖比较和内存成本，不应该无脑使用。如果计算很便宜或引用稳定不影响下游语义，用不用都一样。

**常见误区**：无脑给所有函数和计算加 useMemo/useCallback——滥用没有收益反而增加比较和内存成本，只在昂贵计算或需要稳定引用时使用。

**延伸追问**：可能追问"useCallback 能保证函数永远不变吗"。要点：只在依赖不变的前提下引用稳定；依赖变了就会返回新函数，它控制的是引用稳定性而不是函数内容。

### 51. useRef 为什么更新 current 不触发 render？

useRef 返回的是一个稳定的对象引用，React 只在 Hook 节点中保存这个对象。修改 ref.current 是对普通对象属性的修改，不会创建 Update，不会进入调度流程，也不会触发任何 render。

ref 适合保存不参与渲染的数据——DOM 节点引用、定时器 id、上一次的值、外部实例等。如果数据变化需要反映到 UI，应该使用 state 而不是 ref。ref 和 state 的本质区别就是：state 变化会触发 render，ref 变化不会。

### 52. useTransition 的原理是什么？

startTransition 在执行回调期间设置 transition 上下文。回调内产生的更新在请求 Lane 时会获得 TransitionLane，而回调外的更新（比如输入框值更新）仍使用更紧急的 Lane。两类更新因此可以进入同一个 root，却在不同 render 中按优先级处理。

当低优先级的列表 render 尚未完成，而新的输入更新到来时，React 可以丢弃或暂停旧 WIP 树，先提交紧急的输入更新，再用最新状态重做 transition 渲染。isPending 由 Hook 内部维护的一个 useState 来驱动——startTransition 开始时设为 true，结束时设为 false，表示 transition 相关工作尚未完成。

useTransition 的核心不是延时器，也不会让回调里的同步代码异步执行。被区分的是回调中触发的 React 状态更新的优先级。它适合可延后的渲染，不适合控制文本输入本身，也不能替代请求取消、debounce 或业务 loading 状态。

### 53. useDeferredValue 和 useTransition 有什么区别？

useTransition 是把一组更新标记为非紧急——控制的是"更新产生时的优先级"。useDeferredValue 是把某个值的更新延后——控制的是"值传播到子树的节奏"。典型场景是搜索框：输入框的 value 立即更新保证输入流畅，基于 value 过滤的大列表使用 deferredValue 延后更新，避免每次按键都触发昂贵列表渲染。

前者从更新源头控制优先级，后者从消费端控制值传递。两者可以配合使用但不是替代关系。

### 54. React.memo 和 useMemo 的区别是什么？

React.memo 是组件级缓存——它比较新旧 props 决定函数组件是否可以跳过本次 render。useMemo 是组件内部 Hook——它缓存某个计算结果或对象引用。二者作用层级不同。

React.memo 常需要配合 useMemo/useCallback 使用，因为如果父组件每次 render 都创建新的对象或函数作为 props，即使内容没变，引用也变了，memo 的浅比较会失败，子组件照常 render。memo 提供的是"props 没变就跳过"的边界，但 context 变化、自身 state 变化仍然会触发 render——memo 不是万能跳过机制。

---

## 七、Commit 与副作用

### 55. commit 阶段通常分为哪些子阶段？

**核心结论**：commit 阶段分为 before mutation、mutation、切换 current、layout 四个同步步骤，passive effect 则是 commit 安排的后续异步 flush。整次 commit 不进行可中断时间切片。

**详细讲解**：

- **before mutation**：在宿主变更前读取 DOM 快照的阶段（如 getSnapshotBeforeUpdate）。
- **mutation**：根据 render 阶段打出的 Placement、Update、ChildDeletion 等 flags 执行真正的 DOM 操作——插入、删除、更新、移动节点，同时处理需要在变更前解绑的 ref。
- **切换 current**：执行 root 的 current 指向切换，让最新计算完成的 WIP 树成为 current。这个位置很关键：它必须晚于 mutation，避免 DOM 尚未完成时让外界观察到新树；又必须早于 layout，使 layout effect 和 ref 回调读取到的 React 树、状态与最新 DOM 一致。
- **layout**：同步绑定新的 ref、执行 layout effect（useLayoutEffect 的 create 和类组件的 componentDidUpdate）。
- **passive**：通过 Scheduler 异步调度执行。虽然常被口语化为 commit 的第四阶段，但实现上不在同一个同步调用栈中完成。

**常见误区**：把 passive effect 当作 commit 的同步第四阶段——实际上它是 commit 安排的后续异步 flush，由 Scheduler 调度执行。

**延伸追问**：可能追问"为什么切换 current 必须在 mutation 和 layout 之间"。要点：mutation 操作旧 DOM 需 current 指旧树；layout effect 和 ref 读新状态需 current 已指向新树。

### 56. mutation 阶段做什么？

mutation 阶段执行所有宿主环境变更。它对应 render 阶段打出的各种 flags：Placement 执行节点插入或移动，Update 执行属性更新，ChildDeletion 执行节点删除，Ref 在此时解绑旧 ref，Visibility 切换 Offscreen 子树的显隐状态。

这个阶段会改变真实 UI，因此不能像 render 一样随意中断。React 在遍历 Fiber 树时利用 subtreeFlags 做剪枝——如果某棵子树不包含任何 mutation 类型的 flag，就整棵跳过，不需要进入子树内部检查。

### 57. layout 阶段做什么？

layout 阶段发生在 DOM mutation 完成后、浏览器绘制前。此时 DOM 已经是最新的，因此可以安全地读取布局信息、调用命令式 DOM API。这个阶段主要执行 ref 的 attach（绑定新的 ref 到宿主实例）和 layout effect（useLayoutEffect 的 create 函数）。

如果 layout effect 中同步调用了 setState，React 可能会立即处理这次更新，避免用户看到中间布局状态。这也是为什么 useLayoutEffect 中应该只做必要的同步操作——任何耗时逻辑都会延长 commit 到绘制之间的时间。

### 58. passive effect 为什么异步执行？

**核心结论**：useEffect 通常不需要阻塞浏览器绘制——大多数 effect 是订阅、日志、网络请求等非阻塞性副作用；同步执行会延长 commit 时间，影响页面响应，所以 React 在 commit 完成后通过 Scheduler 异步调度 flush。

**详细讲解**：

- **设计动机**：大多数 passive effect 是订阅、日志、网络请求等非阻塞性副作用，不需要阻塞绘制；如果同步执行会延长 commit 时间，影响页面响应。
- **调度方式**：React 在 commit 完成后通过 Scheduler 安排一个普通优先级的异步任务来 flush passive effects。
- **执行顺序**：flush 时先处理卸载类 effect（执行 destroy/cleanup），再处理更新类 effect（先执行上一次 destroy，再执行本次 create）。这个顺序保证了旧订阅先释放、新订阅后建立。
- **时序推论**：passive effect 和 mutation/layout 不在同一个同步调用栈中完成，这也是 useEffect 不保证在绘制后才执行——React 可能根据调度策略提前 flush。

**常见误区**：以为异步执行意味着 useEffect 一定在绘制后执行——实际上只是常见时序，React 可能根据更新来源提前同步 flush。

**延伸追问**：可能追问"什么场景不能用 useEffect"。要点：需要同步读取布局或修正样式的场景应该用 useLayoutEffect，它在绘制前同步执行。

### 59. effect cleanup 的顺序为什么重要？

更新时必须先清理上一次 effect（执行 destroy），再创建新 effect。否则可能出现重复订阅、重复定时器、旧请求回调污染新状态等问题。卸载时也必须执行 cleanup，避免内存泄漏。

这个顺序体现了 effect 的生命周期：create 表示订阅或创建资源，destroy 表示释放资源。React 通过 commit 阶段统一管理这个生命周期——passive flush 时先执行所有 destroy 再执行所有 create，保证资源释放和重建的有序性。

### 60. useEffect 里发请求，如何处理竞态？

**核心结论**：标准做法是在 effect 的 cleanup 里做失效标记——用局部布尔或 AbortController，cleanup 执行时置位或 abort；请求返回后先检查标记，已失效就直接丢弃、不再 setState。

**详细讲解**：

- **问题本质**：竞态发生在请求返回顺序与发起顺序不一致时：先发的请求后返回，会把新数据覆盖成旧数据。
- **标准解法**：cleanup 里做失效标记。组件卸载和依赖变化两种场景都覆盖：依赖变化时上一次 effect 的 cleanup 先执行，旧请求自然作废。
- **与 React 模型的自洽性**：每个 effect 对应一次数据获取的生命周期，cleanup 负责取消这次生命周期的遗留影响；开发模式的 StrictMode 故意执行 mount、unmount、再 mount，专门暴露没写 cleanup 的这类问题。
- **附带细节**：effect 内不要读 stale closure 里的查询参数，分页参数变了就应该如实声明依赖、重新请求。

**常见误区**：只在组件卸载时处理竞态，忽略了依赖变化也会触发同样的旧请求覆盖问题——cleanup 两种场景都能覆盖。

**延伸追问**：可能追问"为什么 StrictMode 开发模式会 mount 两次"。要点：故意执行 mount、unmount、再 mount，专门暴露没写 cleanup 的 effect，生产环境不会重复执行。

### 61. ref 在 commit 阶段如何处理？

ref 依赖真实宿主实例，所以必须在 DOM 创建或更新完成后处理。更新时如果 ref 变化，mutation 阶段先 detach 旧 ref（函数 ref 调用 null，对象 ref 设 current 为 null），layout 阶段再 attach 新 ref（函数 ref 调用实例，对象 ref 设 current 为实例）。卸载时也要清理 ref。

ref 处理不属于 render 阶段——render 不应该访问真实 DOM。对象 ref 和函数 ref 的区别在于：对象 ref 通过 .current 赋值，函数 ref 通过调用回调传入实例。函数 ref 更灵活，可以在回调中做额外处理。

### 62. 为什么 commit 完要切换 current 树？

**核心结论**：commit 完成后，workInProgress 树代表了最新提交的 UI，应该成为新的 current 树；下一次更新以这棵新 current 为基准，通过 alternate 创建下一棵 workInProgress。不切换的话后续 Diff 会基于旧 UI 计算，一切对不上。

**详细讲解**：

- **双缓存机制**：current 树对应当前屏幕上的 UI，WIP 树是正在计算的新树。commit 后 WIP 树代表的 UI 已经真实生效，必须让 current 指向它，下一轮更新才能以正确基准开始。
- **不切换的后果**：后续 Diff 会基于旧 UI 计算——状态、DOM 和 Fiber 全部不一致，bailout 判断会出错，flags 也不对应实际 DOM。
- **切换时机**：发生在 mutation 之后、layout 之前——这个位置确保 mutation 操作的是旧 DOM（current 仍指向旧树），而 layout effect 和 ref 读到的是新树（current 已指向新树）。

**常见误区**：以为切换 current 只是一个普通的收尾赋值——实际上它的时机选择直接决定了 mutation 和 layout 阶段各自读到的树版本，是双缓存正确性的关键。

**延伸追问**：可能追问"双缓存为什么用两棵树而不是一棵"。要点：一棵树无法在保留当前 UI 对应状态的同时异步计算新树，中断恢复也需要旧树作为参照。

### 63. 为什么删除节点不能只 remove DOM？

被删除的子树里可能包含函数组件的 effect cleanup、ref 清理、嵌套宿主节点、Suspense/Offscreen 状态等。如果只 remove DOM，会遗漏组件卸载生命周期和资源释放——订阅不会取消、定时器不会清除、ref 不会解绑，导致内存泄漏和逻辑错误。

正确做法是递归遍历删除子树：对于函数组件，收集它的 passive effect 到 unmount 队列稍后执行 destroy；对于 HostComponent 和 HostText，记录需要从 DOM 移除的节点并解绑 ref；最后统一从宿主父节点移除对应的 DOM 节点。

追问通常延伸到删除信息为什么记录在父 Fiber 上——父节点在 Diff children 时最清楚哪些旧子节点没有被新 children 消费，由它记录待删除列表并打删除标记最自然。

### 64. commit 为什么要借助 flags，而不是重新 Diff？

Diff 已经在 render 阶段完成，flags 就是 render 阶段给 commit 阶段留下的变更清单。如果 commit 再重新 Diff，会重复计算——需要再次遍历新旧 Fiber 树比较差异，增加复杂度和成本。

flags 让 render 和 commit 分工明确：render 负责"判断哪里变了"并打标记，commit 负责"把这些变化执行掉"。这种设计也保证了 commit 可以高效执行——只需遍历有标记的节点，配合 subtreeFlags 剪枝跳过干净子树。

---

## 八、事件系统

### 65. React 为什么使用事件委托？

**核心结论**：现代 React 把大多数受支持事件的原生监听器统一注册在 root 容器上，而不是为每个 JSX onClick 都安装独立原生 listener；事件发生后从原生 target 找到对应 Fiber，沿路径收集捕获和冒泡回调。

**详细讲解**：

- **价值不只是减少 listener 数量**：统一入口让 React 能标准化事件对象和传播顺序、设置事件优先级、进入批处理上下文，并把事件中的更新映射到合适的 Lane。
- **版本演进**：React 17 起委托目标从 document 调整为 root 容器，让多个 React root 或不同版本共存时边界更清楚。
- **边界情况**："都委托到根"也不是绝对规则——少数不冒泡或有特殊浏览器语义的事件需要单独处理。面试中应说"大多数事件采用根容器委托"。

**常见误区**：以为事件委托只是为了减少内存占用——减少 listener 数量只是附带好处，更核心的是统一入口带来的标准化控制力。

**延伸追问**：可能追问"React 17 前后事件委托有什么变化"。要点：委托目标从 document 改为 root 容器，避免多版本共存时的全局冲突。

### 66. 什么是合成事件？

**核心结论**：合成事件是 React 对原生事件的一层封装，提供一致的事件对象和传播模型，让 React 可以在统一入口里处理事件回调、批处理更新、设置优先级。

**详细讲解**：

- **一致性**：开发者不需要关心浏览器差异，React 统一了 stopPropagation、preventDefault 等行为。
- **与更新流程的联动**：事件回调执行时 React 设置当前优先级，回调中的 setState 据此获得合适的 lane——这是合成事件对 React 更新体系的核心价值。
- **历史细节**：早期 React 还有事件池等优化（重用事件对象减少 GC），现在已不是重点。

**常见误区**：把合成事件仅理解为"抹平浏览器兼容性"的适配层——它更核心的作用是作为统一入口，为事件优先级和批处理提供控制点。

**延伸追问**：可能追问"合成事件和原生事件混用会怎样"。要点：两层独立系统，阻止合成传播不等于阻止原生传播，混用场景需分别考虑。

### 67. React 的捕获和冒泡如何执行？

事件触发后，React 会从事件目标向上收集 Fiber 或 DOM 路径。捕获阶段从根到目标执行 capture 回调（如 onClickCapture），冒泡阶段从目标到根执行 bubble 回调（如 onClick）。这与浏览器事件模型一致，但 React 通过自己的事件系统统一管理回调收集和执行顺序。

React 内部维护一个回调队列，在执行过程中如果调用了 stopPropagation，React 会记录这个信号，不再执行后续传播路径上的回调。需要注意 React 合成事件和原生事件是两层系统——在某些混用场景下，阻止合成传播不等于阻止原生传播。

### 68. 事件优先级是什么？

**核心结论**：不同事件对响应速度要求不同，React 在执行事件回调时设置当前优先级，回调中的 setState 读取当前优先级并映射到对应的 lane，让用户输入可以优先响应。

**详细讲解**：

- **分类**：点击、键盘输入属于离散事件，用户期望立即响应，优先级高；滚动、mousemove 属于连续事件，优先级稍低；普通异步更新优先级更低。
- **机制**：React 在执行事件回调时设置当前优先级，回调中的 setState 读取当前优先级并映射到对应的 lane。
- **效果**：当输入和之前的低优 render 同时存在时，输入相关的更新会获得更高优先级，打断低优 render。

**常见误区**：以为事件优先级是事件本身的属性——实际上它是事件回调里产生的更新所获得的 lane，同一事件里不同回调拿到的优先级一致。

**延伸追问**：可能追问"连续事件和离散事件为什么优先级不同"。要点：离散事件（点击）用户对单次响应感知强烈；连续事件（滚动）中间帧丢失影响小，可降低优先级保障整体流畅。

### 69. stopPropagation 在 React 事件中如何理解？

stopPropagation 用来阻止事件继续传播。React 合成事件内部会记录传播是否被阻止，在执行收集到的回调队列时，如果发现已阻止，就不再继续执行后续传播路径上的回调。

需要注意的是 React 合成事件和原生事件是两层系统。如果在一个 React 合成事件回调中调用了原生事件的 stopPropagation，或者反过来，行为可能不符合预期。某些混用场景要区分"阻止合成传播"和"阻止原生传播"。

---

## 九、Context 与组件模型

### 70. Context 解决什么问题？

Context 解决跨层级传递数据的问题，避免 props 层层透传（prop drilling）。Provider 提供值，Consumer 或 useContext 读取最近 Provider 的值。常见场景包括主题、语言、登录用户、权限、配置等。

但 Context 不是全局状态管理银弹。Provider value 变化时，所有消费该 context 的组件都会更新。如果 value 频繁变化或消费者很多，会带来性能问题。对于高频变化的数据，应考虑拆分 Context 或使用专门的外部 store。

### 71. useContext 如何读取最近 Provider 的值？

这涉及两套互补机制。第一套是上下文栈机制，解决"本次 render 应读到哪个 Provider 的值"。beginWork 进入 Provider 时，React 先保存旧的 context value，再把 Provider 的新 value 压入上下文栈。深度优先遍历期间，子树调用 useContext 读到的自然是栈顶最近 Provider 的值。completeWork 离开 Provider 时再 pop 恢复外层值，所以嵌套 Provider 不会污染兄弟子树。

第二套是 dependencies 和 Lane 机制，解决"Provider 变化后应唤醒哪些消费者"。useContext 不只是取值——React 还会在消费者 Fiber 的 dependencies 上记录它依赖的 context。Provider value 变化时（通过 Object.is 判断），React 会沿子树查找所有依赖了该 context 的消费者，给它们标记 Lane 并沿父路径标 childLanes。这样即使中间组件 props 没变或被 memo 包裹，beginWork 也不会错误跳过真正的消费者。

### 72. Context 为什么可能带来性能问题？

当 Provider 的 value 变化时，所有依赖该 context 的消费者都可能更新。如果 value 是每次 render 新建的对象或函数，即使内容没变，引用也变了，Object.is 判断为不等，导致所有消费者重新渲染。

优化方式包括：拆分 Context（把频繁变化的和稳定的分开）、memo value（用 useMemo 包裹 value 避免引用变化）、使用 selector 思路减少订阅范围、或者对高频变化数据使用外部 store（如 Redux、Zustand）而非 Context。

### 73. React.memo 能阻止 useContext 引发的更新吗？

不能简单认为可以。React.memo 主要比较 props——如果 props 没变就跳过 render。但如果组件内部读取了 context，而 context 值变化了，组件仍然需要更新，因为它依赖的数据变了。

这也是为什么大 Context 容易带来性能问题——memo 不是万能跳过机制。一个组件是否需要 render 取决于多个因素：props 变化、自身 state 变化、context 变化、以及后代是否有当前优先级的更新。memo 只在 props 这一个维度上提供优化边界。

### 74. 函数组件和类组件在更新模型上有什么差异？

类组件的状态存在实例上，更新通过 this.setState 和生命周期方法组织——shouldComponentUpdate、componentDidMount、componentDidUpdate 等。函数组件没有实例，状态存在 Fiber 的 Hook 链表中，通过重新执行函数得到下一次 UI。

在 Fiber 层面，两者都对应 FiberNode，但 beginWork 的处理方式不同。类组件要创建或复用实例、处理生命周期；函数组件要设置 Hooks dispatcher、按调用顺序处理 Hook 链表。现代 React 更强调函数组件和 Hooks，但类组件仍然能帮助理解生命周期、错误边界和旧版本源码。

---

## 十、Suspense 与并发特性

### 75. 受控组件和非受控组件有什么区别？

受控组件的表单值由 React state 驱动：value 绑定 state、onChange 里 setState，React 是数据的唯一事实来源，可以在每次输入时校验、格式化或条件性禁用提交。非受控组件的值由 DOM 自己管理，用 defaultValue 设初值，需要时通过 ref 读取，React 不追踪每次输入。受控方式每次击键都触发一次更新流程，大表单可能有性能开销；非受控几乎零开销，适合简单表单和与第三方库集成；文件输入没有受控用法，只能用 ref。工程上常见的坑是组件在受控与非受控之间切换会触发警告，所以设计自定义输入组件时要固定一种模式，或把「初始非受控、可选受控」的混合模式明确文档化。

### 76. Suspense 的核心原理是什么？

**核心结论**：Suspense 是 render 阶段的"暂时无法完成加可重试"边界：组件读取异步资源时如果结果未就绪就抛出 thenable，work loop 识别后找到最近的 Suspense 边界标记捕获，unwind 尚未完成的工作并渲染 fallback；thenable resolve 后触发 ping 重新调度，重试成功则切回 primary。

**详细讲解**：

- **捕获过程**：当组件读取异步资源时（通过 use 或 lazy），如果结果未就绪就抛出 thenable。work loop 识别它不是普通 Error，会沿 return 找最近的 Suspense Fiber，给边界标记 ShouldCapture，然后 unwind 尚未完成的工作——把已处理的子树回退到边界处。
- **fallback 提交**：边界随后进行另一条 render 路径：保留或隐藏 primary 子树并构造 fallback，完成后仍通过正常 commit 提交。因此用户不会看到半成品 primary。React 同时在 thenable 上注册 ping listener，并把本次 lane 标记为 suspended。
- **重试过程**：thenable resolve 或 reject 后触发 ping，对应 lane 进入可重试集合并重新调度 root。重试时如果能读到结果，就完成 primary 并在 commit 中隐藏或移除 fallback；如果仍抛 thenable，则继续保持挂起。
- **职责边界**：Suspense 本身不发请求、不缓存数据——它只定义"读取未完成结果时怎样挂起、降级和重试"的协调协议。

追问通常延伸到 ping 机制本身——React 捕获 thenable 时会注册监听并做缓存避免重复注册，resolve 后把对应 lane 从挂起集合移入可重试集合并重新调度；ping 只代表这条 lane 值得重试，不保证数据一定就绪。

**常见误区**：以为 Suspense 负责发请求或缓存数据——它只是协调协议，数据获取和缓存由外部库或框架层负责。

**延伸追问**：可能追问"fallback 切回 primary 的过程"。要点：数据就绪触发 ping 重新 render，重试成功后 commit 时删除 fallback Fiber，并把 primary 的 Offscreen 组件切换为可见。

### 77. throw Promise 为什么不是普通错误？

**核心结论**：在 Suspense 语义中，throw thenable 是一种控制流，不是异常崩溃——它告诉 React"当前数据还没准备好，请先显示 fallback，等数据好了再重试"。普通 Error 由错误边界处理，thenable 由 Suspense 边界处理。

**详细讲解**：

- **语义差异**：throw thenable 表示"稍后再来"，是一种可重试的挂起信号；throw Error 表示"渲染失败了"，是不可恢复的错误。
- **捕获对象不同**：普通 Error 应该由 Error Boundary 处理；thenable 则由 Suspense 边界处理。
- **恢复方式不同**：Error Boundary 捕获后渲染降级 UI 并等待状态更新来恢复；Suspense 捕获后渲染 fallback 并等待 thenable resolve 来触发重试。

**常见误区**：以为 throw Promise 会被 try catch 或 Error Boundary 捕获处理——React 在 unwind 时区分 thenable 和 Error，两者走完全不同的边界。

**延伸追问**：可能追问"thenable 和 Promise 什么关系"。要点：thenable 是有 then 方法的对象，Promise 是其标准实现；React 只要求接口符合，便于和各类异步库对接。

### 78. use() 和 useContext 有什么区别？

**核心结论**：use() 是 React 19 引入的运行时读取 API，可以读 Context 也可以读 thenable；和 Hook 最大的区别是它允许在条件语句和循环中调用，因为它不持有自己的状态，只是从当前执行上下文取值。

**详细讲解**：

- **为什么可以条件调用**：Hook 的调用顺序约束来自"按位置复用链表状态"，而 use() 不持有自己的状态，只是从当前执行上下文取值，所以没有这个约束。
- **读 Context**：取最近 Provider 的值，语义与 useContext 相同。
- **读 thenable**：如果数据未就绪，它会挂起当前组件，交给最近的 Suspense 边界显示 fallback；如果 thenable reject 则交给最近的 Error Boundary。这也让 use() 天然适合与 React.lazy、流式 SSR 配合。
- **调用位置限制**：use() 必须在组件或 Hook 函数体内调用，不能在普通异步回调里用。

**常见误区**：以为 use() 是可以随处调用的万能读取函数——它仍受限于组件或 Hook 函数体内，异步回调中不能用。

**延伸追问**：可能追问"use() 读数据未就绪时怎样处理"。要点：挂起当前组件交给最近 Suspense 边界显示 fallback；reject 则交给最近 Error Boundary。

### 79. Suspense fallback 如何切回 primary？

第一次 render 时数据未就绪，Suspense 捕获 thenable 并提交 fallback。数据完成后触发 ping，React 重新 render 同一个边界。如果这次读取数据成功，就渲染 primary 子树并在 commit 阶段替换 fallback——通过删除旧的 fallback Fiber 并把 primary 的 Offscreen 组件切换为 visible 模式来实现。

这个过程依赖 lane、挂起状态、pinged 状态和重新调度，而不是简单的 Promise.then 里手动 setState。如果重试时数据仍未就绪，边界会再次挂起，继续显示 fallback。

### 80. Suspense 和 Error Boundary 有什么区别？

Suspense 处理 thenable，用于异步数据挂起和 fallback 展示；Error Boundary 处理普通错误，用于渲染错误恢复和降级 UI。Suspense 的恢复条件是 thenable resolve；Error Boundary 的恢复通常依赖状态更新或重新渲染。

两者都涉及 render 阶段异常捕获，但语义完全不同。throw thenable 是控制流，表示"稍后再来"；throw Error 是真正的错误，表示"渲染失败了"。React 在 unwind 时会区分这两种情况——thenable 找 Suspense 边界，Error 找 Error Boundary。

### 81. 什么是并发渲染？

**核心结论**：并发渲染不是多线程同时执行组件，而是 React 允许多个"版本的更新意图"同时待处理，并能按 Lane 选择其中一部分进行可中断 render；只有完整 render 完成后才进入同步 commit，用户看到的始终是某个一致版本。

**详细讲解**：

- **定义**：一次低优 render 可以暂停、继续，也可能因更高优更新到来而丢弃 WIP、基于 current 重新计算。
- **四个支点**：Fiber 保存可恢复工作单元；Lane 表达更新集合和优先级；Scheduler 提供执行时机与时间片；双缓存保证未完成结果不影响屏幕。
- **一致性保障**：只有完整 render 完成后才进入同步 commit，因此用户看到的是某个一致版本，而不是并发计算的中间状态。
- **能力边界**：并发是一种调度能力，不保证每次更新都会被切片，也不让代码自动更快——同步 lane、小树更新或已经过期的任务仍可能一次完成。它优化的核心指标是交互响应性，而不是单次 render 的总耗时。

追问通常延伸到 Suspense 为什么与并发关系密切——挂起、切换 fallback、等待数据后重试天然依赖可中断可恢复的 render，Suspense、Transition、流式 SSR 共享 Fiber、Lane、Scheduler 这套底层能力。

**常见误区**：以为并发渲染等于多线程或自动提升性能——它是单线程内的调度能力，优化的是交互响应性而非单次耗时。

**延伸追问**：可能追问"并发渲染会不会导致 UI 不一致"。要点：render 可中断但不直接改 DOM，commit 原子性保证用户只能看到完整提交的版本。

### 82. startTransition 解决什么问题？

**核心结论**：startTransition 把某些更新标记为非紧急，让 React 可以优先响应紧急更新（如输入框内容）、延后或打断非紧急渲染（如搜索结果列表），解决的是"区分紧急和非紧急更新"的问题。

**详细讲解**：

- **典型场景**：输入框内容必须立即更新，但搜索结果列表可以稍后渲染。把列表更新放进 transition 后，React 可以优先响应输入，延后或打断列表渲染。
- **准确语义**：被区分的是回调中触发的 React 状态更新的优先级，而不是让回调里的同步代码异步执行。transition 适合可延后的渲染，不适合控制文本输入本身，也不能替代请求取消、debounce 或业务 loading 状态。
- **实现机制**：回调执行期间设置 transition 上下文，回调内产生的更新获得 transition lane，与外部更紧急的更新区分开。

追问通常延伸到 isPending 的含义——它由 useTransition 内部维护的状态驱动，transition 开始时置 true、完成时置 false，反映的是渲染进度而非网络请求状态，可以用来展示非紧急内容的加载中提示。

**常见误区**：以为 startTransition 是防抖或让回调异步化——它只改变回调中状态更新的优先级标记，不改变同步代码的执行方式。

**延伸追问**：可能追问"useDeferredValue 和 startTransition 有什么区别"。要点：前者从消费端控制值传播节奏，后者从更新源头控制优先级，两者可以配合使用。

### 83. 并发渲染会不会导致 UI 不一致？

React 通过 render/commit 分离和双缓存避免 UI 不一致。并发 render 可以中断，但不会直接修改 DOM。只有当某次 render 完整完成并进入 commit，用户才会看到新 UI。

因此用户不会看到半棵 workInProgress 树。commit 的原子性是并发渲染成立的重要前提——无论 render 被中断多少次、重做多少次，用户看到的始终是某个完整提交的版本。

---

## 十一、性能优化

### 84. bailout 是什么？

**核心结论**：bailout 是 reconciler 在证据充分时复用 current 结果、跳过无关工作的机制。它不是简单判断"props 看起来相同"，因为组件输出还可能受到自身 update、Context 和后代独立更新影响。

**详细讲解**：

- **两层判断**：beginWork 的早期判断首先检查 pendingProps 与 memoizedProps 引用是否相同、type 是否相同、当前 Fiber 的 lanes 和 Context 依赖是否包含 renderLane——四者都满足时当前组件无需执行。
- **childLanes 的作用**：然后看 childLanes：子树也没有当前 lane 就返回 null 整棵跳过；子树有工作则克隆 child/sibling Fiber，只跳过父组件函数的执行，沿工作路径继续向下。
- **lanes 与 childLanes 的分工**：lanes 回答"我自己有没有工作"，childLanes 回答"我的后代有没有工作"。更新时沿 return 冒泡 childLanes，正是为了防止父组件因 props 不变而漏掉深层 state 更新。
- **与相关机制的区别**：React.memo 提供额外的 props 浅比较边界，eagerState 发生在调度之前；它们都能减少工作，但不能和 beginWork bailout 完全画等号。

**常见误区**：以为 bailout 就是"props 相同就跳过"——实际上还要确认自身 lanes 和 Context 依赖没有当前优先级的工作，后代有工作时父组件跳过但子树继续。

**延伸追问**：可能追问"React.memo 和 bailout 什么关系"。要点：memo 是显式的 props 浅比较边界，bailout 是 reconciler 内置的跳过机制，两者互补但不能互相替代。

### 85. React.memo 的原理是什么？

**核心结论**：React.memo 不执行组件也不缓存 DOM，而是返回一种特殊的 element type；reconciler 在 beginWork 中识别到 memo 组件后，在执行内部函数之前先比较新旧 props，浅比较命中且自身无工作时跳过本次 render。

**详细讲解**：

- **比较机制**：默认比较是浅比较，也可以自定义比较函数——返回 true 表示"输出可复用"，返回 false 表示继续更新。
- **比较命中后仍要检查 lane 和 Context**：内部 state dispatch 或消费的 Context 变化必须继续 render；如果只有后代有 lane，则只跳过 memo 组件本身并继续子树。
- **适用边界**：memo 优化的是"父组件重新执行导致的 props 驱动 render"，不是给组件加永久缓存。
- **自定义比较的陷阱**：自定义 compare 必须比较所有会影响输出的 props，包括函数；错误返回 true 可能让子组件长期持有旧闭包。

**常见误区**：以为 memo 后组件就永远不会重新渲染——自身 state 变化、消费的 Context 变化、后代独立更新都会穿透 memo 边界。

**延伸追问**：可能追问"为什么 memo 常要配合 useCallback"。要点：props 里的函数每次 render 都新建，引用比较必不等，浅比较失效，子组件照常 render。

### 86. shallowEqual 的局限是什么？

shallowEqual 只比较对象第一层属性和引用。如果某个 prop 是对象、数组或函数，只要每次 render 新建引用，即使内容一样，浅比较也会认为变化。

所以 React.memo 常需要配合 useMemo/useCallback 稳定对象和函数引用。但如果计算很便宜，过度 memo 也可能得不偿失——memo 本身有依赖比较和内存成本。

### 87. useMemo 一定能提升性能吗？

不一定。useMemo 本身需要保存缓存、比较依赖，也会增加代码复杂度。只有当计算昂贵，或者需要稳定引用来配合子组件 memo 时，它才更有价值。

性能优化应该先定位瓶颈，再使用 memo。无脑 useMemo 可能没有收益，甚至增加成本。正确的做法是先用 Profiler 和 Performance 面板判断瓶颈在哪一层，再针对性优化。

### 88. 大列表卡顿应该从哪些层面优化？

先用 Profiler 和 Performance 面板判断瓶颈属于哪一层，不要先堆 memo。不同原因对应不同手段。

如果是 DOM 数量过多，优先虚拟列表、分页或增量展示，这通常是数量级收益。如果是 render 范围过大，考虑状态下沉、拆分 Context、memo 行组件、稳定 props 和 key，让 bailout 命中。如果是单行计算昂贵，缓存真正昂贵的派生计算，预计算或移出 render，必要时交给 Worker。如果是输入被列表更新阻塞，输入状态保持紧急，用 Transition 或 deferredValue 延后列表 render；debounce 解决触发频率，Transition 解决 React 渲染优先级，两者不是替代关系。如果是 commit 或布局昂贵，减少真实 DOM 变更、布局抖动、同步 layout effect 和复杂样式计算。

时间切片只能改善响应性，不能减少总工作量；稳定 key 主要保证身份和复用，也不能替代虚拟化。面试回答的重点应是先定位成本，再对应到 render、commit、浏览器布局绘制或业务计算。

### 89. 为什么状态下沉有时能优化性能？

状态所属 Fiber 会在更新时带上 Lane。状态放在高层组件时，该组件必须重新执行，通常会重新创建较大的 children/props 图，使更多后代进入 reconciliation。状态下沉到真正使用它的组件后，高层 Fiber 可根据 props 和 Lane bailout，只沿 childLanes 指示的路径进入目标子树，无关兄弟更容易被整棵跳过。

需要注意，React 的调度入口仍然是 root，并不是直接从叶子 Fiber 开始 render；优化来自祖先可以"不执行组件函数但继续沿更新路径向下"。状态也不能为了性能盲目下沉：多个分支需要共享一致状态时，应优先保证数据所有权正确，再通过组件拆分、children 组合或 memo 控制渲染边界。

### 90. Context 拆分为什么能优化性能？

一个大 Context 里如果同时放主题、用户、权限、频繁变化的表单状态，那么任何一部分变化都可能让大量消费者更新。拆成多个 Context 后，消费者只订阅自己需要的数据。

这属于减少更新广播范围。对于高频变化的数据，甚至应考虑专门的外部 store 和 selector，而不是让所有消费者都因为一个字段变化而重新渲染。

### 91. 为什么避免在 render 中创建不稳定对象？

每次 render 新建对象、数组、函数都会产生新引用；当这个引用被传给 memo 子组件、写进 Hook 依赖数组，或用作 Context value 时，引用变化会成为可观察输入，导致 shallowEqual 失败、effect 重跑或 Context 广播。

但"render 中创建对象"本身不是问题，普通局部临时对象通常成本很低，也不会自动触发额外 render。只有引用稳定性影响下游语义或确有昂贵创建成本时，才考虑 useMemo/useCallback；也可以把对象移入 effect、移到组件外，或直接传递更小的基本类型。优化目标是稳定必要的边界，而不是消灭所有对象字面量。

### 92. React 性能优化的原则是什么？

先保证正确性，再定位瓶颈，最后选择最小有效优化。常见方向是减少渲染范围、减少渲染次数、减少单次渲染成本、减少 DOM 数量、稳定引用和 key。

不要把 memo 当作默认答案。面试中更好的回答是：根据具体卡顿来源区分 render 成本、commit 成本、JS 计算成本和 DOM 数量成本，再针对性选择优化手段。

---

## 十二、工程能力与扩展机制

### 93. React.lazy 的原理是什么？

React.lazy 用来把动态 import 的模块包装成一个懒加载组件。组件第一次渲染时，如果模块还没加载完成，会抛出 thenable，让最近的 Suspense 边界捕获并显示 fallback。模块加载完成后，React 重新渲染这个 lazy 组件，读取默认导出并渲染真实组件。

它的关键点不是简单的动态 import，而是和 Suspense 的 throw thenable 机制结合。lazy 组件在 render 阶段读取异步结果，未完成就挂起，完成后重试。

### 94. Error Boundary 的原理是什么？

Error Boundary 用来捕获子树 render 阶段、生命周期和 constructor 中抛出的普通错误，并渲染降级 UI。类组件通过 getDerivedStateFromError 和 componentDidCatch 实现错误边界。

它和 Suspense 的区别是：Suspense 捕获 thenable，表示"数据还没准备好"；Error Boundary 捕获 Error，表示"渲染失败"。捕获后 React 会 unwind 到最近的错误边界，给边界打标记并重新渲染 fallback UI。

追问通常延伸到 commit 阶段出错为什么更难处理——此时部分 DOM 变更和副作用可能已经发生，回滚成本远高于 render 阶段丢弃重做，而错误边界主要捕获的也是 render 阶段的错误。

### 95. 类组件和函数组件在源码模型上有什么差异？

类组件有实例，state 和生命周期方法挂在实例上，更新通过 this.setState 进入 update queue。函数组件没有实例，每次 render 都是重新执行函数，状态保存在 Fiber 的 Hooks 链表上。

在 Fiber 层面，两者都会对应 FiberNode，但 beginWork 的处理方式不同。类组件要创建或复用实例、处理生命周期；函数组件要设置 Hooks dispatcher、按调用顺序处理 Hook 链表。

### 96. StrictMode 为什么会双重调用？生产会有影响吗？

**核心结论**：StrictMode 是开发模式专用的检查工具，双重调用是故意的：render 函数被调用两次用来暴露不纯的 render，effect 执行 mount、cleanup、再 mount 的完整周期用来暴露缺少 cleanup 的副作用。生产构建里完全不生效，没有运行时开销。

**详细讲解**：

- **双重 render**：render 函数被调用两次，用来暴露不纯的 render——比如在 render 里修改外部变量或发请求。
- **重复挂载 effect**：effect 执行 mount、cleanup、再 mount 的完整周期，用来暴露缺少 cleanup 的副作用，比如没取消的订阅和请求。React 18 起这个 remount 行为默认开启。
- **背后的动机**：并发渲染下 render 可能被中断后丢弃重做，副作用放在 render 里或不写 cleanup，就会泄漏或重复。开发环境的请求两次不是 bug，而是提醒。
- **正确态度**：把暴露的问题修掉（纯函数 render、完整 cleanup），而不是关掉 StrictMode。

**常见误区**：把开发环境请求两次当成 bug 想办法绕过（比如用 ref 挡住第二次）——正确做法是补全 cleanup 让副作用可重入。

**延伸追问**：可能追问"生产环境会不会双调用"。要点：不会，StrictMode 的双重调用只在开发构建生效，生产环境零开销。

### 97. Portal 的实现原理是什么？

Portal 允许子节点在 React 组件树中保持原来的父子关系，但实际 DOM 插入到另一个容器中，比如 modal 挂到 document.body。它解决的是逻辑树和宿主 DOM 树不完全一致的问题。render 阶段它仍然参与正常 reconciliation；commit 阶段插入宿主节点时，不插入到普通父 DOM，而是插入到 Portal 指定的 container。

Portal 的关键特性是事件冒泡沿 React 逻辑树而不是 DOM 树：挂在 body 上的 modal，其内部事件依然会触发外层组件的 onClick，Context 也按组件树传递。这是它与手动 appendChild 搬 DOM 的本质区别——Portal 只改变宿主层挂载位置，不改变 React 的父子关系，所以卸载、更新、生命周期都由外层组件正常驱动。

### 98. forwardRef 解决什么问题？

函数组件默认没有实例，普通 ref 不能直接指向函数组件。forwardRef 允许父组件把 ref 透传给函数组件内部的某个 DOM 节点或命令式对象。

它创建了一种特殊 element type，beginWork 处理时会把 ref 作为第二个参数传给 render 函数。常和 useImperativeHandle 配合，用来暴露受控的命令式 API。

### 99. React 为什么需要 JSX runtime？

JSX 不是浏览器原生语法，需要编译成函数调用。JSX runtime 提供这些函数，把编译产物转换成 ReactElement。

新旧两代 runtime 的主要差异在引入方式：classic runtime 要求每个文件手动 import React，编译产物调用 React.createElement；automatic runtime 由编译器自动注入 jsx/jsxs 的 import，开发者不再需要写 import React，打包工具也能更精确地 tree-shake。jsxs 针对多 children 的静态结构做了优化，开发环境还会用带警告的 jsxDEV 版本帮助定位问题。runtime 与编译器约定了这套协议，也让 React 19 能在此基础上继续演进（比如直接从 ReactElement 简化为不透明对象）。

### 100. SSR 解决什么问题？

SSR 是在服务器把 React 组件渲染成 HTML，浏览器可以更快看到首屏内容，也有利于 SEO；客户端 JS 加载后再通过 hydration 接管页面，让静态 HTML 具备交互能力。SSR 的收益主要是首屏可见时间和搜索引擎抓取；成本是服务端渲染开销、数据同构、缓存策略、hydration 成本和渲染一致性问题。

React 18 之后 SSR 还有流式渲染与选择性水合：服务端可以用 pipeToNodeWritable 分块发送 HTML，先到先展示，Suspense 边界内的慢内容可以后补；客户端不必等整页 hydrate 完才开始交互，用户点了哪块就优先 hydrate 哪块。这把传统 SSR「全部到齐才能交互」的 TTI 瓶颈拆掉了，是面试区分度较高的加分点。

### 101. Hydration 的原理和难点是什么？

Hydration 是客户端 React 在已有服务端 HTML 上建立 Fiber 树、绑定事件并接管页面的过程。它尽量复用已有 DOM，而不是重新创建整棵 DOM。

难点主要有四个：一是服务端 HTML 和客户端首次 render 必须尽量一致，否则 mismatch，React 会对不一致处重建节点并告警，而差异往往来自时间、随机数、窗口对象这些环境不同；二是事件系统要在已有 DOM 上恢复委托绑定，让静态页面「活」过来；三是流式 SSR 下内容分段到达，Suspense 边界要能占位等待后补内容；四是选择性 hydration 打破了「整页顺序水合」的假设，哪块先 hydrate 取决于内容到达与用户交互，代码不能依赖「父组件一定先于子组件可交互」这类顺序假设。

---

## 十三、综合追问

### 102. 面试中如何回答"React 调度到底难在哪里"？

难点不只是写一个优先队列，而是"允许插队之后仍保持状态和 UI 正确"。React 必须同时解决四个问题：怎样表达多个更新的优先级与批次；怎样把递归 render 变成可暂停工作；怎样保留被跳过更新并按原顺序重放；怎样保证用户永远只看到完整提交的版本。

完整链路可以这样展开：事件或 dispatch 创建 update，根据当前事件/transition 上下文选择 Lane，写入组件 update queue。Lane 标到目标 Fiber，并以 childLanes 沿父路径传播；root 用 pendingLanes 汇总所有未完成工作。root 从 pending、suspended、pinged 等集合选择 next lanes，再映射成 Scheduler priority。已有 callback 优先级相同就复用，不同则取消并重排。Scheduler 只决定 callback 何时获得时间片；Fiber work loop 才真正执行 beginWork/completeWork，并在工作单元之间通过 shouldYield 暂停。高优更新插队时，低优 update 仍保留在 base queue；WIP 可以丢弃，但 current 树始终代表已提交 UI。高优任务完成后，低优任务按队列顺序重放。render 完整完成才进入不可中断的 commit，依据 flags 原子地修改 DOM、ref 和 effects，最后切换 current。

最后总结边界：Scheduler 不理解 Fiber 和 DOM，Lane 也不负责占用主线程；并发不是多线程，时间切片不减少总计算量。真正困难的是 Fiber、Lane、UpdateQueue、Scheduler 和双缓存共同维护"响应性、可恢复性、确定性和提交原子性"。
