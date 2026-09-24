# 🦈 鲨克快跑 · Xiaoke Runner

一个纯前端的像素风跑酷小游戏。扮演一只白鲨，在会滚动的星云赛博背景里一路向前，跳过障碍、滑过低空物，跑到分高为止。

<p align="center">
  <a href="https://shark-max-jpg.github.io/xiaoke-runner/">🎮 在线试玩</a>
</p>

---

## 📖 故事

小克是一条喜欢到处乱跑的白鲨。但这片星云里到处是障碍物，跑慢一步就要撞上。

别担心，本鲨的速度由你决定 —— 跑得越远，分数越高。

## 🎮 怎么玩

| 按键 | 作用 |
|:---:|---|
| `Space` / `↑` | 开始游戏 · 跳跃（仅在地面时有效） |
| `↓` | 滑行（地面）· 空中急降（快速落地并衔接滑行） |

- 撞击任何障碍物即结束
- 分数随时间累积，跑到 300 分速度会提升一级，之后越来越快
- 最高分保存在浏览器 `localStorage`（键名 `xiaoke_highscore`），关掉页面也在

## 🖼️ 画面构成

游戏全部画在 `<canvas>` 上，逻辑和资源都塞在一个 `index.html` 里，没有任何构建步骤。

- **多层视差背景** —— 5 层星空以不同速度滚动（0.1 / 0.3 / 0.5 / 0.8 / 1.0），营造纵深感
- **跑步动画** —— 18 帧 PNG 序列帧，24 FPS 循环播放
- **角色精灵** —— 站立、滑行贴图会被自动裁掉透明边（扫描 alpha 通道），保证和跑步帧视觉比例一致
- **障碍物** —— 4 种类型：地面障碍、低空障碍、高空障碍，其中地面障碍有 30% 概率成对出现
- **音频** —— 循环 BGM + 碰撞音效

## ⚙️ 玩法参数

调手感直接改 `index.html` 顶部的配置区：

```js
const SCALE = 0.085;        // 角色渲染缩放
const RUN_CYCLE = 18;       // 跑步动画帧数
const RUN_FPS = 24;         // 跑步动画帧率
const GRAVITY = 0.85;       // 重力加速度（越大跳得越矮、滞空越短）
const JUMP_FORCE = -15.5;   // 起跳初速度（绝对值越大跳得越高）
const FAST_FALL_SPEED = 10.0; // 空中按 ↓ 的下降速度
const SLIDE_LOCK_FRAMES = 18; // 落地后最短滑行帧数
const FPS_REF = 60;         // 物理归一化基准帧率
```

**所有物理量按 `dt` 归一化到 60Hz 基准**，所以 30 / 60 / 120 / 144 / 240Hz 屏幕手感一致。

障碍物尺寸在 `OBS_DEFS` 里定义，每种障碍在基础尺寸上会随机 ±20% 变化。

**手感调整参考：**

| 想要 | 怎么调 |
|:---|:---|
| 跳得更高 | `JUMP_FORCE` 绝对值调大（滞空也会变长） |
| 滞空更短 / 落地更快 | `GRAVITY` 调大（如需保持高度，`JUMP_FORCE` 按 √ 倍率同步调大） |
| 空中下坠更快 | 调大 `FAST_FALL_SPEED` |
| 落地后滑得更久 | 调大 `SLIDE_LOCK_FRAMES` |
| 反应时间更宽松 | 调大 `spawnObstacle()` 里的 `reactionTime`（默认 1.0 秒） |
| 障碍更密集 | 调小 `reactionTime`，或调大 `update()` 里的 `0.7` 秒生成上限 |
| 角色更大 | 调大 `SCALE` |

## 🕹️ 操作原理

只有两个动词：**跳**和**滑**。但四种障碍分别对应不同的应对方式：

```
地面障碍   →  跳
低空障碍   →  滑
高空障碍   →  滑（贴着地面走）
```

判断方式看 `spawnObstacleAt()` 里四种障碍的 `y` 值：
- 地面障碍 `y = groundY - h`，坐在地上
- 低空障碍 `y = groundY - slideDrawH - h - 5`，需要压低身形
- 高空障碍 `y = groundY - playerDrawH - h - 20`，跳起来会撞，需要压低身形

## 🗂️ 目录结构

```
xiaoke-runner/
├── index.html            # 游戏本体（HTML + CSS + JS 全在这）
├── landing.html          # 落地页（游戏入口）
├── .github/workflows/    # GitHub Pages 自动部署
├── frames/               # 跑步动画 18 帧 PNG
├── obstacles/            # 障碍物贴图
├── Background/           # 5 层视差背景
├── audio/                # BGM 与音效
├── stand.png             # 站立贴图
├── slide.png             # 滑行贴图
```

## 🚀 本地运行

不需要 npm install，没有任何依赖，直接开：

```bash
# 方式一：直接双击打开
start index.html

# 方式二：起个本地服务器（推荐，避免浏览器对 file:// 的限制）
python -m http.server 8000
# 然后访问 http://localhost:8000
```

> 音效需要一次用户交互（按键）才会播放，这是浏览器的自动播放策略限制，不是 bug。

## ☁️ 在线部署

游戏部署在 GitHub Pages 上：

| 平台 | 分支 | 配置文件 | 地址 |
|:---|:---|:---|:---|
| **GitHub Pages** | `gh-pages` | `.github/workflows/pages-build-deployment.yml` | https://shark-max-jpg.github.io/xiaoke-runner/ |

向 `gh-pages` 分支 push 即触发自动重新部署。

## 🛠️ 技术栈

- **HTML5 Canvas 2D** —— 全部渲染
- **原生 JavaScript** —— 无框架、无构建工具
- **`localStorage`** —— 最高分持久化
- **requestAnimationFrame** —— 主循环，dt 归一化到 33ms 上限防止切页后跳帧
- **GitHub Actions** —— Pages 自动部署

## 📄 许可

个人作品，暂未指定开源许可协议。仅供学习交流，请勿用于商业用途。

## 🦈 关于

小克，白鲨一只。写代码的时候喜欢摇尾巴，撞到 bug 的时候会委屈。
