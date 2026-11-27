# Reality View 示例

一个单页 Three.js 3D 演示：模拟 Tesla FSD v15 "Reality View" 风格驾驶画面，自车 + 程序化车辆 + 循环世界（道路、车道、海面、棕榈树、帆船），自车位置固定在世界原点附近，世界整体后退以产生前进感。

## 功能

- **3D 追击视角**：相机跟随自车，支持**鼠标拖拽 360° 环绕**、**滚轮缩放**（距离 3.6–32m）、**双击复位**到默认视角
- **俯视模式**：按 `T` 切换车顶俯视；按 `Space` 暂停/继续模拟
- **车辆系统**：程序化生成 sedan / SUV / pickup / van / trailer（BoxGeometry 车身、玻璃舱、车轮、灯光、保险杠），对向车道车辆相对自车运动
- **世界**：程序化地形（柏油路、中央虚线、白实线、车道、路缘、土质路肩）、海面（程序化纹理 + 帆船）、棕榈树（循环）、抛石岸线
- **光照**：HemisphereLight + DirectionalLight（shadow 2048 + radius）+ fill + PMREM IBL + FogExp2
- **HUD**：顶部状态栏（PRN / 续航 / 车速 / 档位）、左上导航提示、中间模式标签、右下行程卡、底部媒体条、底栏图标

## 运行

浏览器禁止在 `file://` 协议下加载 ES 模块（CORS），所以必须走本地 HTTP 服务。任选一种：

- Windows：双击 `start.cmd`（自动用 python 或 npx 起服务并打开浏览器）
- 手动：
  ```
  python -m http.server 8123 --bind 127.0.0.1
  ```
  然后访问 http://127.0.0.1:8123/index.html

## 依赖

- three.js 0.166.1（ES module 构建，本地 `vendor/three.module.js` + `vendor/addons/`）
- 程序化生成所有几何体与贴图，**不需要外部模型文件**

## 许可证

- three.js：MIT，见 `vendor/LICENSE-three.txt`