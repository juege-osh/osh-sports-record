# OSH Sports Record

面向中文用户的轻量级体育资料查询服务，展示当前冠军、历史冠军、世界纪录和来源网页地址。项目使用 Node.js 标准库实现，不依赖数据库、打包器或第三方 npm 包。

## 特性

- 中文优先的项目名、分类、状态和更新时间展示
- 当前冠军、历史冠军、世界纪录统一数据模型
- 每条信息都保留来源网页地址
- 每小时自动刷新并校验来源网页可访问性
- 启动时把 JSON 快照加载到内存，查询无需磁盘扫描
- 零运行时 npm 依赖，部署占用小

## 快速开始

```bash
npm start
```

默认监听 `http://localhost:8787`。

也可以构建 GitHub Pages 静态版本：

```bash
npm run build:pages
```

静态版本会直接读取 `data/sports.snapshot.json`，适合没有 Node 后端的托管环境。

刷新数据：

```bash
npm run refresh
```

运行测试：

```bash
npm test
```

## API

### `GET /api/sports`

查询体育项目列表。

参数：

- `q`：按中文名、英文名、分类、冠军、纪录持有人模糊搜索
- `category`：按分类过滤，例如 `篮球`、`足球`、`综合赛事`

### `GET /api/sports/:id`

查询单个项目详情。

### `POST /api/refresh`

手动触发刷新。服务本身也会每小时自动刷新一次。

## 数据口径

“当前冠军”按各项目最新已经产生的冠军、卫冕冠军或当前冠军头衔统计。正在进行但尚未决出冠军的赛季会在 `status` 中说明。

首批数据覆盖中国用户高关注的主流联赛、国际足球、网球大满贯、F1、奥运会和典型田径/游泳世界纪录。后续扩展只需要在 `data/sports.seed.json` 添加项目或来源。

刷新器每小时执行一次：

1. 读取 `data/sports.seed.json` 中的结构化事实。
2. 并发访问来源网页，限制单页读取大小以控制内存。
3. 校验网页中是否还能匹配冠军、纪录保持者、成绩等关键字。
4. 生成 `data/sports.snapshot.json`，并把无法访问或关键字不匹配的条目标记为 `needsReview`。

这种方式不会把站点小改版误写成新冠军；真正自动改写冠军数据时，应为对应来源增加稳定的官方 API 或专用解析器。

## 轻量部署建议

```bash
PORT=8787 REFRESH_INTERVAL_MS=3600000 npm start
```

可用 systemd、pm2 或容器平台常驻运行。因为没有数据库，备份 `data/sports.snapshot.json` 即可保留当前快照。
