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
pnpm exec wrangler deploy
```

线上地址：https://reality-view.heiyanquan.workers.dev

### GitHub Actions 自动部署

push 到 `main` 会自动触发 `.github/workflows/deploy.yml`：云端安装依赖 → `pnpm run build` → `wrangler deploy`。也可在仓库 Actions 页面手动 **Run workflow**。

前置条件（已配置）：仓库 Secret `CLOUDFLARE_API_TOKEN`（Workers 编辑权限的 API Token）。

## 常见问题

**`pnpm install` 报 `ERR_PNPM_IGNORED_BUILDS`（esbuild/workerd）**

pnpm 12 默认禁止依赖的 postinstall 脚本。已在 `pnpm-workspace.yaml` 中通过 `allowBuilds` 放行 `esbuild` 和 `workerd`（wrangler 的本地运行时需要）。若以后新增依赖遇到同样报错，把包名加进该文件即可：

```yaml
allowBuilds:
  esbuild: true
  workerd: true
  <新包名>: true
```

**不要用 `pnpm dlx wrangler`**

`dlx` 在独立缓存目录执行，不读取项目的 `pnpm-workspace.yaml`，会再次触发 `ERR_PNPM_IGNORED_BUILDS`。wrangler 已作为 devDependency 安装，请用 `pnpm exec wrangler <cmd>`。

**`pnpm add` 提示 `minimumReleaseAge`**

pnpm 有供应链防护，默认只安装发布满一定时间的版本。`vite@8.4.0` 因发布时间较新被记录在 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 中；其他包被拦时可同样按需豁免，但建议优先等几天或降级版本。

**React StrictMode 下场景被创建两次**

`main.jsx` 开启了 `StrictMode`，开发模式下 `useEffect` 会挂载→卸载→再挂载。`RealityView.dispose()` 已完整清理 RAF、事件监听、几何体/材质/贴图和 renderer，无需特殊处理；但新增副作用时注意必须可重复执行。

## 依赖

- react 19 / react-dom 19
- three 0.166.1（npm 包，含 `three/addons/`）
- vite 8 + @vitejs/plugin-react
- wrangler 4（devDependency，仅部署用）
- 程序化生成所有几何体与贴图，**不需要外部模型文件**

## 许可证

- three.js：MIT
