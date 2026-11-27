# Reality View 示例

一个 React + Vite + Three.js 3D 演示：模拟 Tesla FSD v15 "Reality View" 风格驾驶画面，自车 + 程序化车辆 + 循环世界（道路、车道、海面、棕榈树、帆船），自车位置固定在世界原点附近，世界整体后退以产生前进感。

## 功能

- **3D 追击视角**：相机跟随自车，支持**鼠标拖拽 360° 环绕**、**滚轮缩放**（距离 3.6–32m）、**双击复位**到默认视角
- **俯视模式**：按 `T` 切换车顶俯视；按 `Space` 暂停/继续模拟
- **车辆系统**：程序化生成 sedan / SUV / pickup / van / trailer（BoxGeometry 车身、玻璃舱、车轮、灯光、保险杠），对向车道车辆相对自车运动，含简单跟车逻辑
- **世界**：程序化地形（柏油路、中央虚线、白实线、车道、路缘、土质路肩）、海面（程序化纹理 + 帆船）、棕榈树（循环）、抛石岸线
- **光照**：HemisphereLight + DirectionalLight（shadow 2048 + radius）+ fill + PMREM IBL + FogExp2
- **HUD**：React 组件渲染——顶部状态栏（PRN / 续航 / 车速 / 档位）、左上导航提示、中间模式标签、右下行程卡、底部媒体条、底栏图标；车速、电量、行程里程随模拟实时更新（约 10Hz）

## 代码结构

```
index.html            Vite 入口
src/
  main.jsx            React 挂载点
  App.jsx             HUD 组件 + 场景生命周期管理
  styles.css          全部 HUD 样式
  three/
    RealityView.js    Three.js 场景类（世界构建、相机、交通、动画循环、dispose）
    textures.js       程序化 Canvas 贴图（天空/沥青/水面/混凝土）
    vehicles.js       程序化车辆生成（5 种车型）
```

## 运行

需要 Node.js 18+ 和 pnpm。

- Windows：双击 `start.cmd`（自动 `pnpm install` 并启动 dev server）
- 手动：
  ```
  pnpm install
  pnpm run dev        # http://localhost:5173
  ```

## 构建与部署

```
pnpm run build        # 输出到 dist/
pnpm run preview      # 本地预览构建产物
```

Cloudflare Workers 静态部署（`wrangler.jsonc` 已指向 `dist/`）：

```
pnpm run build
npx wrangler deploy
```

## 依赖

- react 19 / react-dom 19
- three 0.166.1（npm 包，含 `three/addons/`）
- vite 8 + @vitejs/plugin-react
- 程序化生成所有几何体与贴图，**不需要外部模型文件**

## 许可证

- three.js：MIT
