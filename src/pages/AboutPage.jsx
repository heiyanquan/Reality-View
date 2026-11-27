import { Link } from 'react-router-dom';

export default function AboutPage() {
  return (
    <main className="about-page">
      <h1>Reality View</h1>
      <p className="subtitle">Tesla FSD 风格 3D 驾驶环境演示</p>

      <section>
        <h2>关于这个项目</h2>
        <p>
          这是一个纯前端的 Three.js 演示：程序化生成道路、车辆、海面、棕榈树等场景元素，
          模拟自动驾驶仪表盘中的 "Reality View" 环绕视角。自车固定在原点，世界向后运动制造前进感。
        </p>
      </section>

      <section>
        <h2>技术栈</h2>
        <ul>
          <li>React 19 + Vite</li>
          <li>Three.js 0.166（程序化几何体与贴图，无外部模型）</li>
          <li>React Router（多页面路由）</li>
          <li>Cloudflare Workers 静态托管 + GitHub Actions 自动部署</li>
        </ul>
      </section>

      <section>
        <h2>操作</h2>
        <ul>
          <li>鼠标拖拽：360° 环绕视角</li>
          <li>滚轮：缩放距离</li>
          <li>双击：复位视角</li>
          <li><kbd>T</kbd>：车顶俯视模式</li>
          <li><kbd>空格</kbd>：暂停 / 继续</li>
        </ul>
      </section>

      <Link to="/" className="back-link">← 返回驾驶视图</Link>
    </main>
  );
}
