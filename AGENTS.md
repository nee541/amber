# AGENTS.md

## 项目说明

本项目是一个名为 Amber（琥珀）的本地优先客户端应用，用于帮助用户记录、整理和长期保存自己购买或收藏的物品信息。

应用重点关注物品档案化管理，例如生产日期、保质期、购买记录、备注，以及后续可能加入的图片、扫描件、票据等本地归档资料。

Amber 使用 SQLite 作为本地业务数据库，使用应用数据目录保存扫描件、图片和 PDF 文件。SQLite 只保存结构化元数据、关联关系和文件路径。

Amber 使用 shadcn/ui + shadcn blocks 作为组件库，除非库中不提供相关组件，否则请使用 shadcn/ui + shadcn blocks。

本文件只记录长期可复用的工程规则。具体产品需求、MVP 范围、页面设计和任务目标应写在当前任务 prompt 或 `docs/` 文档中，不要直接写进本文件。

## 技术栈

- 使用 Tauri v2。
- 使用 React + TypeScript。
- 使用 Vite 作为前端构建工具。
- 使用 pnpm 作为包管理工具。
- Rust 代码只用于 Tauri 命令、系统能力接入和平台相关逻辑。
- 不要在未确认的情况下切换到 Electron、Flutter、React Native、Next.js 或其他主要框架。
- 数据库选型使用 SQLite。

## 常用命令

```bash
pnpm install
pnpm dev
pnpm build
pnpm tauri dev
pnpm tauri build
````

当修改 `src-tauri` 下的 Rust/Tauri 代码时，还需要执行：

```bash
cd src-tauri
cargo check
```

## 代码组织

* 业务逻辑不要直接写在 React 组件中。
* 日期计算、状态判断等纯逻辑应放在独立的 domain/helper 模块中。
* 本地存储、文件访问、Tauri API 调用应通过 adapter/repository 封装。
* 页面组件不要直接调用 localStorage、IndexedDB、SQLite 或 Tauri 文件系统 API。
* 优先做小而清晰的改动，不要随意重构整个项目。

## TypeScript 规则

* 尽量使用明确的类型定义。
* 避免使用 `any`，除非有明确理由。
* 持久化数据需要有清晰的类型结构。
* 纯函数应尽量独立于 React，方便测试和复用。

## 依赖规则

* 不要随意新增大型依赖。
* 新增 UI 框架、状态管理库、数据库库、OCR、云服务 SDK、分析统计 SDK 前，需要先说明理由并等待确认。
* 不要引入闭源、付费或不活跃的依赖。

## 本地优先规则

* 默认本地优先。
* 不要主动添加登录、账号系统、云同步、远程后端、埋点或遥测。
* 用户数据和导入文件应被视为私有本地数据。
* 不要删除或覆盖用户选择的原始文件。

## 完成标准

任务完成前应尽量保证：

* 功能符合当前任务要求。
* TypeScript 构建通过。
* 修改 Rust/Tauri 代码时，`cargo check` 通过。
* 说明修改了哪些文件。
* 如有未完成内容、假设或限制，需要明确说明。

## Git 提交规范

提交信息遵循 Conventional Commits 1.0.0。

基本格式：

```text
<type>[optional scope]: <description>
````

常用类型：

* `feat`: 新功能
* `fix`: 问题修复
* `docs`: 文档变更
* `style`: 代码格式调整，不影响逻辑
* `refactor`: 重构，不新增功能也不修复问题
* `perf`: 性能优化
* `test`: 测试相关
* `build`: 构建系统或依赖变更
* `ci`: CI 配置变更
* `chore`: 其他维护性变更
* `revert`: 回滚提交

如果包含破坏性变更，使用 `!` 或 `BREAKING CHANGE:`：

```text
feat(storage)!: change item persistence format
```
