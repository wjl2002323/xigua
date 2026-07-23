# 瓜田灯火 · Claude Code 交接文档

西瓜供需可视化平台。前端原型已完成（本项目），后端待建。

> 本文件从 claude.ai/design 项目《西瓜供需地图APP设计》(eb352cda-c78b-4db7-9685-10dbcc3fe9ca) 导入，2026-07-23。

## 已交付的设计产物
- `瓜田灯火.html` — Web 大屏地图主屏（纯 HTML + d3-geo + canvas；`?mobile=1` 为手机紧凑布局）
- `瓜田灯火-手机三屏.dc.html` — 手机三屏：地图（iframe 复用上文件）/ 瓜农供给注册 / 需求发布
- `mock-data.js` — 种子随机假数据生成器（可复现），也是**后端数据模型的权威参考**

## 产品共识（已与产品负责人 grilling 确认）
- 连线双层语义：**暗线 = 潜在匹配**（按需求方收货半径计算），**亮线 = 已成交**
- 点位：双色分供需（供给 mint 绿 / 需求琥珀），**大小 = 量级（吨）**，临期供给（≤3天）红色脉冲
- 交互核心：点击点位 → 高亮其匹配网络 + 详情卡（直接展示电话，轻联系模式；任一方可"标记已成交"）
- 视图模式：潜在匹配 / 已成交 / 紧迫度 / 平面；分类筛选：瓜农 / 个人 / 水果店 / 工厂
- 初始镜头聚焦黄淮海产区，可缩放看全国

## 数据模型（对齐 mock-data.js 字段）
```
Supply  { id, name, city, lon, lat, variety, tons, daysLeft(售卖窗口), phone, priceWish?, createdAt }
Demand  { id, name, city, lon, lat, type: individual|store|factory, tons, radiusKm, phone, createdAt }
Link    { supplyId, demandId, km, deal: bool, dealAt? }   // 潜在匹配由服务端计算，deal 由用户标记
```
匹配规则（当前原型逻辑，可迭代）：对每个 Demand，取 radiusKm 内按距离最近的供给，
上限 factory 6 / store 4 / individual 2。半径默认值按类型：60 / 200 / 420 km。

## 后端待办（建议顺序）
1. Supply / Demand CRUD + 手机号验证码注册（瓜农端要极简，4 必填项见注册屏）
2. 匹配计算服务（geo 距离 + 半径 + 上限；后续可加品种偏好、量级匹配度权重）
3. "标记已成交"接口（双端任一方可标；防刷：同一 link 幂等）
4. 地图数据接口：按 viewport bbox + 筛选条件返回点与线（点量大时服务端聚合）
5. daysLeft 每日递减 + 过期下架任务；紧迫度视图直接消费该字段

## 注意
- 地图几何：world-atlas countries-50m（Natural Earth，公有领域），勿手绘地理
- 电话在原型中为打码假数据；真实系统注意隐私（成交前可用虚拟号中转，V2）
